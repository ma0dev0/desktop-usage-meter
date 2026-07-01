import AppKit

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    private let statusStore: UsageStatusStore
    private let windowController: NotchWindowController

    override init() {
        statusStore = UsageStatusStore()
        windowController = NotchWindowController()
        super.init()
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)

        windowController.onReload = { [weak self] in
            self?.statusStore.reload()
        }
        windowController.onCopyStatusPath = { [weak self] in
            guard let path = self?.statusStore.statusPath else {
                return
            }
            NSPasteboard.general.clearContents()
            NSPasteboard.general.setString(path, forType: .string)
        }

        statusStore.onChange = { [weak self] status, issue in
            DispatchQueue.main.async {
                self?.windowController.update(status: status, issue: issue)
            }
        }

        windowController.show()
        statusStore.start()
    }

    func applicationWillTerminate(_ notification: Notification) {
        windowController.stop()
        statusStore.stop()
    }
}
