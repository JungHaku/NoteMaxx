import AppKit
import WebKit
import Foundation

let PORT = 5190

let appSupportDir = FileManager.default
    .urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
    .appendingPathComponent("NoteMaxx")

var serverProcess: Process?

func portIsUp() -> Bool {
    guard let url = URL(string: "http://localhost:\(PORT)/") else { return false }
    var up = false
    let sem = DispatchSemaphore(value: 0)
    let req = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 0.6)
    URLSession.shared.dataTask(with: req) { _, resp, _ in
        if let r = resp as? HTTPURLResponse, r.statusCode == 200 { up = true }
        sem.signal()
    }.resume()
    sem.wait()
    return up
}

func findNode() -> String? {
    let candidates = ["/opt/homebrew/bin/node", "/usr/local/bin/node", "/usr/bin/node"]
    for c in candidates where FileManager.default.isExecutableFile(atPath: c) { return c }
    return nil
}

// If nothing is serving the port (e.g. `npm run dev`), serve the production
// build staged in ~/Library/Application Support/NoteMaxx. Desktop itself is
// TCC-protected, so the server must run from outside it.
func startServerIfNeeded() -> Bool {
    if portIsUp() { return true }
    guard let node = findNode() else { return false }
    let serverJS = appSupportDir.appendingPathComponent("server.js")
    let appDir = appSupportDir.appendingPathComponent("app")
    guard FileManager.default.fileExists(atPath: serverJS.path),
          FileManager.default.fileExists(atPath: appDir.appendingPathComponent("index.html").path)
    else { return false }

    let logURL = FileManager.default.homeDirectoryForCurrentUser
        .appendingPathComponent("Library/Logs/NoteMaxx.log")
    if !FileManager.default.fileExists(atPath: logURL.path) {
        FileManager.default.createFile(atPath: logURL.path, contents: nil)
    }
    let logHandle = try? FileHandle(forWritingTo: logURL)
    logHandle?.seekToEndOfFile()

    let p = Process()
    p.executableURL = URL(fileURLWithPath: node)
    p.arguments = [serverJS.path, appDir.path, String(PORT)]
    p.currentDirectoryURL = URL(fileURLWithPath: "/")
    if let h = logHandle {
        p.standardOutput = h
        p.standardError = h
    }
    do { try p.run() } catch { return false }
    serverProcess = p
    for _ in 0..<40 {
        if portIsUp() { return true }
        usleep(250_000)
    }
    return false
}

final class AppDelegate: NSObject, NSApplicationDelegate, WKUIDelegate {
    var window: NSWindow!
    var webView: WKWebView!

    func applicationDidFinishLaunching(_ notification: Notification) {
        let serverReady = startServerIfNeeded()

        let config = WKWebViewConfiguration()
        config.websiteDataStore = WKWebsiteDataStore.default()
        webView = WKWebView(frame: .zero, configuration: config)
        webView.uiDelegate = self
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

        if serverReady {
            webView.load(URLRequest(url: URL(string: "http://localhost:\(PORT)/")!))
        } else {
            let alert = NSAlert()
            alert.alertStyle = .critical
            alert.messageText = "NoteMaxx could not start"
            alert.informativeText =
                "Missing node or the app build. Run `npm run deploy:app` in ~/Desktop/NoteMaxx, then relaunch."
            alert.runModal()
            NSApp.terminate(nil)
        }
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }

    func applicationWillTerminate(_ notification: Notification) {
        serverProcess?.terminate()
    }

    @objc func reloadPage(_ sender: Any?) {
        webView.reload()
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
