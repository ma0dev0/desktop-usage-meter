import AppKit

@MainActor
final class NotchWindowController: NSObject {
    private let mousePassthroughInterval: TimeInterval = 0.05
    private let panel: NSPanel
    private let meterView: NotchMeterView
    private var currentStatus: NotchStatus?
    private var currentIssue: UsageStatusIssue?
    private var mousePassthroughTimer: Timer?
    private var freshnessTimer: Timer?
    private var isPointingHandCursorVisible = false

    var onReload: (() -> Void)?
    var onCopyStatusPath: (() -> Void)?

    override init() {
        meterView = NotchMeterView(frame: CGRect(x: 0, y: 0, width: 280, height: 32))
        panel = NSPanel(
            contentRect: meterView.bounds,
            styleMask: [.borderless, .nonactivatingPanel],
            backing: .buffered,
            defer: false
        )

        super.init()

        panel.contentView = meterView
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = false
        panel.hidesOnDeactivate = false
        panel.isFloatingPanel = true
        panel.becomesKeyOnlyIfNeeded = true
        panel.worksWhenModal = true
        panel.ignoresMouseEvents = true
        panel.level = .statusBar
        panel.collectionBehavior = [
            .canJoinAllSpaces,
            .stationary,
            .ignoresCycle,
            .fullScreenAuxiliary
        ]

        meterView.onMouseDown = { [weak self] event in
            self?.showMenu(event: event)
        }

        NotificationCenter.default.addObserver(
            self,
            selector: #selector(screenParametersDidChange),
            name: NSApplication.didChangeScreenParametersNotification,
            object: nil
        )
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
    }

    func show() {
        reposition()
        startMousePassthroughTimer()
        startFreshnessTimer()
        panel.orderFrontRegardless()
        updateMousePassthrough()
    }

    func stop() {
        mousePassthroughTimer?.invalidate()
        mousePassthroughTimer = nil
        freshnessTimer?.invalidate()
        freshnessTimer = nil
        meterView.updateHover(at: nil)
        updateCursor(isInteractive: false)
        panel.orderOut(nil)
    }

    func update(status: NotchStatus?, issue: UsageStatusIssue? = nil) {
        currentStatus = status
        currentIssue = issue
        meterView.update(status: status, issue: issue)
        reposition()
        if panel.isVisible {
            updateMousePassthrough()
        }
    }

    @objc private func screenParametersDidChange() {
        reposition()
    }

    private func reposition() {
        guard let screen = targetScreen() else {
            return
        }

        let frame = screen.frame
        let visibleFrame = screen.visibleFrame
        let menuBarHeight = max(24, min(44, frame.maxY - visibleFrame.maxY))
        let notchGapWidth = notchGapWidth(for: screen, menuBarHeight: menuBarHeight)
        let width = widthForMenuBar(
            screenWidth: frame.width,
            menuBarHeight: menuBarHeight,
            notchGapWidth: notchGapWidth
        )
        let height = max(28, menuBarHeight)
        let x = round(frame.midX - width / 2)
        let y = round(frame.maxY - height)

        panel.setFrame(CGRect(x: x, y: y, width: width, height: height), display: true)
        meterView.notchGapWidth = notchGapWidth
        meterView.frame = panel.contentView?.bounds ?? CGRect(x: 0, y: 0, width: width, height: height)
        meterView.needsDisplay = true
    }

    private func targetScreen() -> NSScreen? {
        if let main = NSScreen.main, hasNotchAreas(main) {
            return main
        }
        if let notchedScreen = NSScreen.screens.first(where: hasNotchAreas) {
            return notchedScreen
        }
        return NSScreen.main ?? NSScreen.screens.first
    }

    private func hasNotchAreas(_ screen: NSScreen) -> Bool {
        guard let leftArea = screen.auxiliaryTopLeftArea,
              let rightArea = screen.auxiliaryTopRightArea,
              !leftArea.isEmpty,
              !rightArea.isEmpty else {
            return false
        }
        return rightArea.minX > leftArea.maxX
    }

    private func notchGapWidth(for screen: NSScreen, menuBarHeight: CGFloat) -> CGFloat {
        let fallbackGap: CGFloat = menuBarHeight >= 32 ? 124 : 112
        guard let leftArea = screen.auxiliaryTopLeftArea,
              let rightArea = screen.auxiliaryTopRightArea,
              !leftArea.isEmpty,
              !rightArea.isEmpty else {
            return fallbackGap
        }

        let measuredGap = rightArea.minX - leftArea.maxX
        return max(fallbackGap, measuredGap + 12)
    }

    private func widthForMenuBar(screenWidth: CGFloat, menuBarHeight: CGFloat, notchGapWidth: CGFloat) -> CGFloat {
        let desiredSideContentWidth: CGFloat = menuBarHeight >= 32 ? 232 : 204
        let outerPadding: CGFloat = 14
        let notchSidePadding: CGFloat = 18
        let screenMargin: CGFloat = 48
        let maxSideContentWidth = (screenWidth - screenMargin - notchGapWidth) / 2
            - outerPadding
            - notchSidePadding
        let sideContentWidth = min(desiredSideContentWidth, max(148, maxSideContentWidth))
        return notchGapWidth + (sideContentWidth + outerPadding + notchSidePadding) * 2
    }

    private func startMousePassthroughTimer() {
        guard mousePassthroughTimer == nil else {
            return
        }
        let timer = Timer(timeInterval: mousePassthroughInterval, repeats: true) { [weak self] _ in
            Task { @MainActor in
                self?.updateMousePassthrough()
            }
        }
        timer.tolerance = 0.015
        RunLoop.main.add(timer, forMode: .common)
        mousePassthroughTimer = timer
    }

    private func startFreshnessTimer() {
        guard freshnessTimer == nil else {
            return
        }
        freshnessTimer = Timer.scheduledTimer(withTimeInterval: 60, repeats: true) { [weak self] _ in
            Task { @MainActor in
                guard let self else {
                    return
                }
                self.meterView.update(status: self.currentStatus, issue: self.currentIssue)
            }
        }
    }

    private func updateMousePassthrough() {
        let mouseLocation = NSEvent.mouseLocation
        guard panel.frame.contains(mouseLocation) else {
            meterView.updateHover(at: nil)
            updateCursor(isInteractive: false)
            panel.ignoresMouseEvents = true
            return
        }

        let windowPoint = panel.convertPoint(fromScreen: mouseLocation)
        let viewPoint = meterView.convert(windowPoint, from: nil)
        let isInteractive = meterView.updateHover(at: viewPoint)
        panel.ignoresMouseEvents = !isInteractive
        updateCursor(isInteractive: isInteractive)
    }

    private func updateCursor(isInteractive: Bool) {
        if isInteractive {
            guard !isPointingHandCursorVisible else {
                return
            }
            NSCursor.pointingHand.set()
            isPointingHandCursorVisible = true
        } else if isPointingHandCursorVisible {
            NSCursor.arrow.set()
            isPointingHandCursorVisible = false
        }
    }

    private func showMenu(event: NSEvent) {
        meterView.updateHover(at: nil)
        updateCursor(isInteractive: false)

        let menu = NSMenu()

        addStatusItems(to: menu)

        let reloadItem = NSMenuItem(title: "JSONを再読み込み", action: #selector(reload), keyEquivalent: "r")
        reloadItem.target = self
        menu.addItem(reloadItem)

        let copySummaryItem = NSMenuItem(title: "状態をコピー", action: #selector(copyStatusSummary), keyEquivalent: "c")
        copySummaryItem.target = self
        copySummaryItem.isEnabled = currentStatus != nil || currentIssue != nil
        menu.addItem(copySummaryItem)

        let copyPathItem = NSMenuItem(title: "JSONパスをコピー", action: #selector(copyStatusPath), keyEquivalent: "")
        copyPathItem.target = self
        menu.addItem(copyPathItem)

        menu.addItem(.separator())

        if let updatedAt = currentStatus?.updatedAt {
            let formatter = DateFormatter()
            formatter.dateStyle = .none
            formatter.timeStyle = .medium
            let item = NSMenuItem(title: "JSON更新: \(formatter.string(from: updatedAt))", action: nil, keyEquivalent: "")
            item.isEnabled = false
            menu.addItem(item)
            menu.addItem(.separator())
        }

        let quitItem = NSMenuItem(title: "終了", action: #selector(quit), keyEquivalent: "q")
        quitItem.target = self
        menu.addItem(quitItem)

        NSMenu.popUpContextMenu(menu, with: event, for: meterView)
    }

    private func addStatusItems(to menu: NSMenu) {
        guard let status = currentStatus else {
            let title = currentIssue?.title ?? "データ待機中"
            let item = NSMenuItem(title: title, action: nil, keyEquivalent: "")
            item.isEnabled = false
            menu.addItem(item)
            if let detail = currentIssue?.detail {
                let detailItem = NSMenuItem(title: detail, action: nil, keyEquivalent: "")
                detailItem.isEnabled = false
                menu.addItem(detailItem)
            }
            menu.addItem(.separator())
            return
        }

        let providers = NotchStatusFormatting.visibleProviders(in: status)
        guard !providers.isEmpty else {
            for line in NotchStatusFormatting.emptyStateLines(for: status) {
                let item = NSMenuItem(title: line, action: nil, keyEquivalent: "")
                item.isEnabled = false
                menu.addItem(item)
            }
            menu.addItem(.separator())
            return
        }

        let freshnessItem = NSMenuItem(
            title: NotchStatusFormatting.freshnessLabel(for: status),
            action: nil,
            keyEquivalent: ""
        )
        freshnessItem.isEnabled = false
        menu.addItem(freshnessItem)
        menu.addItem(.separator())

        for provider in providers {
            let providerItem = NSMenuItem(
                title: NotchStatusFormatting.providerSummary(provider, in: status),
                action: nil,
                keyEquivalent: ""
            )
            providerItem.isEnabled = false
            menu.addItem(providerItem)

            for limit in NotchStatusFormatting.visibleLimits(for: provider) {
                let limitItem = NSMenuItem(
                    title: "  \(NotchStatusFormatting.limitSummary(limit))",
                    action: nil,
                    keyEquivalent: ""
                )
                limitItem.isEnabled = false
                menu.addItem(limitItem)
            }
        }

        menu.addItem(.separator())
    }

    private func statusSummaryText() -> String {
        NotchStatusFormatting.statusSummaryText(for: currentStatus, issue: currentIssue)
    }

    @objc private func reload() {
        onReload?()
    }

    @objc private func copyStatusPath() {
        onCopyStatusPath?()
    }

    @objc private func copyStatusSummary() {
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(statusSummaryText(), forType: .string)
    }

    @objc private func quit() {
        NSApp.terminate(nil)
    }
}
