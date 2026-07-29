import AppKit
import WebKit
import Foundation

// NoteMaxx is fully self-contained: the production web build lives inside the
// app bundle at Contents/Resources/app, and a WKURLSchemeHandler serves it over
// notemaxx://app/. No Node, no localhost port, no external files — the bundle is
// the whole app, so it can be zipped and handed to someone else.
//
// A custom scheme (rather than file://) is what makes localStorage work: file://
// pages get an opaque origin in WKWebView and localStorage throws.

let SCHEME = "notemaxx"
let HOST = "app"
let START_URL = URL(string: "\(SCHEME)://\(HOST)/index.html")!
let STORAGE_KEY = "notemaxx.pages.v1"

let appSupportDir = FileManager.default
    .urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
    .appendingPathComponent("NoteMaxx")

// MARK: - Serving the bundled build

final class BundleSchemeHandler: NSObject, WKURLSchemeHandler {
    private let root: URL
    private var live = Set<ObjectIdentifier>()

    init(root: URL) {
        self.root = root.standardizedFileURL
    }

    private static let mimeTypes: [String: String] = [
        "html": "text/html; charset=utf-8",
        "js": "text/javascript; charset=utf-8",
        "mjs": "text/javascript; charset=utf-8",
        "css": "text/css; charset=utf-8",
        "json": "application/json; charset=utf-8",
        "svg": "image/svg+xml",
        "png": "image/png",
        "jpg": "image/jpeg",
        "jpeg": "image/jpeg",
        "gif": "image/gif",
        "ico": "image/x-icon",
        "webp": "image/webp",
        "woff": "font/woff",
        "woff2": "font/woff2",
        "ttf": "font/ttf",
        "map": "application/json; charset=utf-8",
        "webmanifest": "application/manifest+json",
    ]

    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        live.insert(ObjectIdentifier(task))

        let path = task.request.url?.path ?? "/"
        var file = root.appendingPathComponent(path.isEmpty || path == "/" ? "index.html" : path)
            .standardizedFileURL

        // Never let a crafted path escape the bundled app directory.
        if file.path != root.path && !file.path.hasPrefix(root.path + "/") {
            file = root.appendingPathComponent("index.html")
        }

        var isDir: ObjCBool = false
        let exists = FileManager.default.fileExists(atPath: file.path, isDirectory: &isDir)
        // SPA fallback: unknown routes render index.html.
        if !exists || isDir.boolValue {
            file = root.appendingPathComponent("index.html")
        }

        guard let data = try? Data(contentsOf: file) else {
            finish(task, error: NSError(domain: NSURLErrorDomain, code: NSURLErrorFileDoesNotExist))
            return
        }

        let ext = file.pathExtension.lowercased()
        let mime = Self.mimeTypes[ext] ?? "application/octet-stream"
        // Vite emits <script type="module" crossorigin>, which requests in CORS
        // mode — without this header WebKit rejects it even same-origin.
        let response = HTTPURLResponse(
            url: task.request.url!,
            statusCode: 200,
            httpVersion: "HTTP/1.1",
            headerFields: [
                "Content-Type": mime,
                "Content-Length": String(data.count),
                "Access-Control-Allow-Origin": "*",
                "Cache-Control": "no-cache",
            ]
        )!

        guard live.contains(ObjectIdentifier(task)) else { return }
        task.didReceive(response)
        task.didReceive(data)
        finish(task, error: nil)
    }

    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {
        live.remove(ObjectIdentifier(task))
    }

    private func finish(_ task: WKURLSchemeTask, error: Error?) {
        guard live.remove(ObjectIdentifier(task)) != nil else { return }
        if let error { task.didFailWithError(error) } else { task.didFinish() }
    }
}

// MARK: - App

// Imports notes from the pre-1.0 build, which served the app over
// http://localhost:5190 and so stored them under a different origin. This has to
// run at document start, before the app's own bootstrap seeds a welcome page and
// makes the key non-empty. `legacy-notes.json` only exists on the machine the
// notes were exported from, so elsewhere this returns nil and never runs.
func legacyImportScript() -> WKUserScript? {
    let legacy = appSupportDir.appendingPathComponent("legacy-notes.json")
    guard let raw = try? String(contentsOf: legacy, encoding: .utf8),
        let literal = try? String(data: JSONEncoder().encode(raw), encoding: .utf8)
    else { return nil }

    let js = """
        (function () {
          try {
            if (!localStorage.getItem('\(STORAGE_KEY)')) {
              localStorage.setItem('\(STORAGE_KEY)', \(literal));
            }
          } catch (e) {}
        })();
        """
    return WKUserScript(source: js, injectionTime: .atDocumentStart, forMainFrameOnly: true)
}

// MARK: - Attachments
//
// The web app stores attachments in IndexedDB. Opening one means handing the
// bytes to us: WKWebView can't usefully open a blob: URL, and the point of the
// feature is that a PDF opens in Preview and a .docx opens in Word. We write the
// bytes to a per-launch temp directory and let LaunchServices do the rest.
final class FileOpener: NSObject, WKScriptMessageHandler {
    static let name = "openFile"

    private lazy var dir: URL = {
        let d = FileManager.default.temporaryDirectory
            .appendingPathComponent("NoteMaxx-attachments", isDirectory: true)
        try? FileManager.default.createDirectory(at: d, withIntermediateDirectories: true)
        return d
    }()

    func userContentController(
        _ controller: WKUserContentController, didReceive message: WKScriptMessage
    ) {
        guard let body = message.body as? [String: Any],
            let base64 = body["data"] as? String,
            let data = Data(base64Encoded: base64)
        else { return }

        // Use only the last path component so a crafted name can't escape the
        // temp directory.
        let raw = (body["name"] as? String) ?? "attachment"
        var name = (raw as NSString).lastPathComponent
        if name.isEmpty || name == "." || name == ".." { name = "attachment" }

        let target = dir.appendingPathComponent(name)
        do {
            try data.write(to: target, options: .atomic)
        } catch {
            NSSound.beep()
            return
        }
        NSWorkspace.shared.open(target)
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate, WKUIDelegate, WKNavigationDelegate {
    var window: NSWindow!
    var webView: WKWebView!
    let fileOpener = FileOpener()

    func applicationDidFinishLaunching(_ notification: Notification) {
        guard let resourceRoot = Bundle.main.resourceURL?.appendingPathComponent("app"),
            FileManager.default.fileExists(
                atPath: resourceRoot.appendingPathComponent("index.html").path)
        else {
            fail("NoteMaxx is missing its web build. Rebuild it with `npm run build:mac`.")
            return
        }

        let config = WKWebViewConfiguration()
        config.websiteDataStore = WKWebsiteDataStore.default()
        config.setURLSchemeHandler(BundleSchemeHandler(root: resourceRoot), forURLScheme: SCHEME)
        config.userContentController.add(fileOpener, name: FileOpener.name)
        if let legacyImport = legacyImportScript() {
            config.userContentController.addUserScript(legacyImport)
        }

        webView = WKWebView(frame: .zero, configuration: config)
        webView.uiDelegate = self
        webView.navigationDelegate = self
        if #available(macOS 13.3, *) {
            webView.isInspectable = true
        }

        window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1280, height: 820),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )
        window.title = "NoteMaxx"
        window.minSize = NSSize(width: 700, height: 480)
        window.backgroundColor = NSColor(calibratedWhite: 0.97, alpha: 1.0)
        window.isReleasedWhenClosed = false
        window.center()
        window.setFrameAutosaveName("NoteMaxxMain")
        window.contentView = webView
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)

        // NOTEMAXX_DEV=1 loads the Vite dev server instead, for hacking on the
        // web code with HMR. Note it is a different origin, so it has its own
        // separate notes.
        if ProcessInfo.processInfo.environment["NOTEMAXX_DEV"] == "1",
            let dev = URL(string: "http://localhost:5190/")
        {
            webView.load(URLRequest(url: dev))
        } else {
            webView.load(URLRequest(url: START_URL))
        }
    }

    private func fail(_ message: String) {
        let alert = NSAlert()
        alert.alertStyle = .critical
        alert.messageText = "NoteMaxx could not start"
        alert.informativeText = message
        alert.runModal()
        NSApp.terminate(nil)
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }

    @objc func reloadPage(_ sender: Any?) {
        webView.reload()
    }

    // Without this, <input type="file"> does nothing at all in WKWebView.
    func webView(
        _ webView: WKWebView,
        runOpenPanelWith parameters: WKOpenPanelParameters,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping ([URL]?) -> Void
    ) {
        let panel = NSOpenPanel()
        panel.canChooseFiles = true
        panel.canChooseDirectories = false
        panel.allowsMultipleSelection = parameters.allowsMultipleSelection
        panel.begin { result in
            completionHandler(result == .OK ? panel.urls : nil)
        }
    }

    // The web app uses alert()/confirm() (e.g. delete confirmation) — WKWebView
    // silently drops these unless the UI delegate maps them to native panels.
    func webView(
        _ webView: WKWebView,
        runJavaScriptAlertPanelWithMessage message: String,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping () -> Void
    ) {
        let alert = NSAlert()
        alert.messageText = "NoteMaxx"
        alert.informativeText = message
        alert.addButton(withTitle: "OK")
        alert.runModal()
        completionHandler()
    }

    func webView(
        _ webView: WKWebView,
        runJavaScriptConfirmPanelWithMessage message: String,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping (Bool) -> Void
    ) {
        let alert = NSAlert()
        alert.messageText = "NoteMaxx"
        alert.informativeText = message
        alert.addButton(withTitle: "OK")
        alert.addButton(withTitle: "Cancel")
        completionHandler(alert.runModal() == .alertFirstButtonReturn)
    }
}

func buildMainMenu() -> NSMenu {
    let main = NSMenu()

    let appItem = NSMenuItem()
    main.addItem(appItem)
    let appMenu = NSMenu()
    appMenu.addItem(
        withTitle: "About NoteMaxx",
        action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
    appMenu.addItem(NSMenuItem.separator())
    appMenu.addItem(
        withTitle: "Hide NoteMaxx", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
    appMenu.addItem(NSMenuItem.separator())
    appMenu.addItem(
        withTitle: "Quit NoteMaxx", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
    appItem.submenu = appMenu

    let editItem = NSMenuItem()
    main.addItem(editItem)
    let editMenu = NSMenu(title: "Edit")
    editMenu.addItem(withTitle: "Undo", action: Selector(("undo:")), keyEquivalent: "z")
    editMenu.addItem(withTitle: "Redo", action: Selector(("redo:")), keyEquivalent: "Z")
    editMenu.addItem(NSMenuItem.separator())
    editMenu.addItem(withTitle: "Cut", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
    editMenu.addItem(withTitle: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
    editMenu.addItem(withTitle: "Paste", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
    editMenu.addItem(
        withTitle: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
    editItem.submenu = editMenu

    let viewItem = NSMenuItem()
    main.addItem(viewItem)
    let viewMenu = NSMenu(title: "View")
    viewMenu.addItem(
        withTitle: "Reload", action: #selector(AppDelegate.reloadPage(_:)), keyEquivalent: "r")
    let fs = NSMenuItem(
        title: "Enter Full Screen", action: #selector(NSWindow.toggleFullScreen(_:)),
        keyEquivalent: "f")
    fs.keyEquivalentModifierMask = [.command, .control]
    viewMenu.addItem(fs)
    viewItem.submenu = viewMenu

    let winItem = NSMenuItem()
    main.addItem(winItem)
    let winMenu = NSMenu(title: "Window")
    winMenu.addItem(
        withTitle: "Minimize", action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m")
    winMenu.addItem(
        withTitle: "Close", action: #selector(NSWindow.performClose(_:)), keyEquivalent: "w")
    winItem.submenu = winMenu
    NSApp.windowsMenu = winMenu

    return main
}

let app = NSApplication.shared
app.setActivationPolicy(.regular)
let delegate = AppDelegate()
app.delegate = delegate
app.mainMenu = buildMainMenu()
app.run()
