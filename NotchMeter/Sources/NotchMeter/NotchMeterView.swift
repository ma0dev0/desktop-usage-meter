import AppKit

@MainActor
final class NotchMeterView: NSView {
    private enum InteractiveTarget {
        case provider(ProviderStatus)
        case placeholder
    }

    private var status: NotchStatus?
    private var statusIssue: UsageStatusIssue?
    private var hoveredProviderID: String?
    private var isPlaceholderHovered = false
    var notchGapWidth: CGFloat = 112 {
        didSet {
            needsDisplay = true
        }
    }
    var onMouseDown: ((NSEvent) -> Void)?

    override var isFlipped: Bool {
        true
    }

    override func acceptsFirstMouse(for event: NSEvent?) -> Bool {
        true
    }

    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        configureAccessibility()
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        configureAccessibility()
    }

    func update(status: NotchStatus?, issue: UsageStatusIssue? = nil) {
        self.status = status
        self.statusIssue = issue
        let summary = NotchStatusFormatting.tooltipText(for: status, issue: issue)
        toolTip = summary
        setAccessibilityLabel(NotchStatusFormatting.accessibilityText(for: status, issue: issue))
        needsDisplay = true
    }

    override func mouseDown(with event: NSEvent) {
        onMouseDown?(event)
    }

    override func rightMouseDown(with event: NSEvent) {
        onMouseDown?(event)
    }

    func containsInteractivePoint(_ point: CGPoint) -> Bool {
        interactiveTarget(at: point) != nil
    }

    @discardableResult
    func updateHover(at point: CGPoint?) -> Bool {
        let target = point.flatMap { interactiveTarget(at: $0) }
        let nextProviderID: String?
        let nextPlaceholderHovered: Bool
        switch target {
        case .provider(let provider):
            nextProviderID = provider.id
            nextPlaceholderHovered = false
        case .placeholder:
            nextProviderID = nil
            nextPlaceholderHovered = true
        case nil:
            nextProviderID = nil
            nextPlaceholderHovered = false
        }

        if nextProviderID != hoveredProviderID || nextPlaceholderHovered != isPlaceholderHovered {
            hoveredProviderID = nextProviderID
            isPlaceholderHovered = nextPlaceholderHovered
            needsDisplay = true
        }

        return target != nil
    }

    private func interactiveTarget(at point: CGPoint) -> InteractiveTarget? {
        let providers = visibleProviders()
        if providers.isEmpty {
            return providerBackgroundRect(for: placeholderContentRect()).contains(point) ? .placeholder : nil
        }

        let rects = providerContentRects(for: providers)
        for (index, rect) in rects.enumerated() {
            if providerBackgroundRect(for: rect).contains(point) {
                return .provider(providers[index])
            }
        }
        return nil
    }

    override func draw(_ dirtyRect: NSRect) {
        super.draw(dirtyRect)

        NSColor.clear.setFill()
        dirtyRect.fill()

        let providers = visibleProviders()
        if providers.isEmpty {
            let placeholderRect = placeholderContentRect()
            drawPlaceholderBackground(in: placeholderRect)
            drawPlaceholder(in: placeholderRect)
            return
        }

        let rects = providerContentRects(for: providers)

        drawProviderBackground(for: providers[0], in: rects[0])
        if providers.count > 1 {
            drawProviderBackground(for: providers[1], in: rects[1])
        }

        drawProvider(providers[0], in: rects[0], alignRight: false)
        if providers.count > 1 {
            drawProvider(providers[1], in: rects[1], alignRight: true)
        }
    }

    private func visibleProviders() -> [ProviderStatus] {
        NotchStatusFormatting.visibleProviders(in: status)
    }

    private func configureAccessibility() {
        setAccessibilityElement(true)
        setAccessibilityLabel("Usage Meter データ待機中")
        setAccessibilityHelp("クリックすると詳細メニューを開きます")
    }

    private func providerContentRects(for providers: [ProviderStatus]) -> [CGRect] {
        let outerPadding: CGFloat = 14
        let notchSidePadding: CGFloat = 18
        let sideSlotWidth = (bounds.width - notchGapWidth) / 2
        let maxSideWidth = max(148, sideSlotWidth - outerPadding - notchSidePadding)

        guard providers.count > 1 else {
            let providerId = providers.first?.id.lowercased()
            guard let provider = providers.first else {
                return []
            }
            let width = providerContentWidth(for: provider, maxWidth: maxSideWidth)
            let rect = providerId == "codex"
                ? CGRect(x: bounds.width - outerPadding - width, y: 0, width: width, height: bounds.height)
                : CGRect(x: outerPadding, y: 0, width: width, height: bounds.height)
            return [rect]
        }

        let leftWidth = providerContentWidth(for: providers[0], maxWidth: maxSideWidth)
        let rightWidth = providerContentWidth(for: providers[1], maxWidth: maxSideWidth)
        return [
            CGRect(x: outerPadding, y: 0, width: leftWidth, height: bounds.height),
            CGRect(x: bounds.width - outerPadding - rightWidth, y: 0, width: rightWidth, height: bounds.height)
        ]
    }

    private func providerContentWidth(for provider: ProviderStatus, maxWidth: CGFloat) -> CGFloat {
        guard NotchStatusFormatting.visibleLimits(for: provider).isEmpty else {
            return maxWidth
        }
        return min(maxWidth, max(78, providerHeaderWidth(provider) + 4))
    }

    private func placeholderContentRect() -> CGRect {
        let outerPadding: CGFloat = 14
        let notchSidePadding: CGFloat = 18
        let sideSlotWidth = (bounds.width - notchGapWidth) / 2
        let sideWidth = max(148, sideSlotWidth - outerPadding - notchSidePadding)
        return CGRect(x: outerPadding, y: 0, width: min(232, sideWidth), height: bounds.height)
    }

    private func providerBackgroundRect(for rect: CGRect) -> CGRect {
        CGRect(
            x: rect.minX - 10,
            y: bounds.minY + 3,
            width: rect.width + 20,
            height: bounds.height - 6
        )
    }

    private func drawProviderBackground(for provider: ProviderStatus, in rect: CGRect) {
        let backgroundRect = providerBackgroundRect(for: rect)
        let stale = NotchStatusFormatting.isStale(provider: provider, in: status)
        let hovered = hoveredProviderID == provider.id
        let hasRefreshError = NotchStatusFormatting.hasRefreshError(provider)
        let isRefreshing = NotchStatusFormatting.isRefreshing(provider)
        let urgency = NotchStatusFormatting.providerUrgency(for: provider)
        let accentColor = providerStateColor(
            for: provider,
            urgency: urgency,
            hasRefreshError: hasRefreshError,
            isRefreshing: isRefreshing
        )
        let background = NSBezierPath(
            roundedRect: backgroundRect,
            xRadius: backgroundRect.height / 2,
            yRadius: backgroundRect.height / 2
        )
        let backgroundAlpha: CGFloat
        if stale {
            backgroundAlpha = hovered ? 0.7 : 0.62
        } else {
            backgroundAlpha = hovered ? 0.9 : 0.82
        }
        NSColor(calibratedWhite: 0.02, alpha: backgroundAlpha).setFill()
        background.fill()

        if (urgency != .normal || hasRefreshError || isRefreshing) && !stale {
            accentColor.withAlphaComponent(hovered ? 0.16 : 0.1).setFill()
            background.fill()
        }

        let border = NSBezierPath(
            roundedRect: backgroundRect.insetBy(dx: 0.5, dy: 0.5),
            xRadius: (backgroundRect.height - 1) / 2,
            yRadius: (backgroundRect.height - 1) / 2
        )
        border.lineWidth = hovered ? 1.4 : (urgency == .normal && !hasRefreshError && !isRefreshing ? 1 : 1.2)
        accentColor.withAlphaComponent(borderAlpha(
            stale: stale,
            hovered: hovered,
            urgency: urgency,
            hasRefreshError: hasRefreshError,
            isRefreshing: isRefreshing
        )).setStroke()
        border.stroke()
    }

    private func drawPlaceholderBackground(in rect: CGRect) {
        let backgroundRect = providerBackgroundRect(for: rect)
        let background = NSBezierPath(
            roundedRect: backgroundRect,
            xRadius: backgroundRect.height / 2,
            yRadius: backgroundRect.height / 2
        )
        NSColor(calibratedWhite: 0.02, alpha: isPlaceholderHovered ? 0.88 : 0.78).setFill()
        background.fill()

        if isPlaceholderHovered {
            let border = NSBezierPath(
                roundedRect: backgroundRect.insetBy(dx: 0.5, dy: 0.5),
                xRadius: (backgroundRect.height - 1) / 2,
                yRadius: (backgroundRect.height - 1) / 2
            )
            border.lineWidth = 1.4
            NSColor.white.withAlphaComponent(0.22).setStroke()
            border.stroke()
        }
    }

    private func drawPlaceholder(in rect: CGRect) {
        let text = placeholderText(for: rect.width)
        let hasDetail = text.detail != nil && rect.width >= 184 && bounds.height >= 38
        let trailingWidth: CGFloat = rect.width >= 196 ? 88 : 72
        let leadingWidth = max(64, rect.width - trailingWidth - (hasDetail ? 8 : 0))
        let rowRect = hasDetail
            ? CGRect(x: rect.minX, y: bounds.minY + 7, width: rect.width, height: 15)
            : CGRect(x: rect.minX, y: 0, width: rect.width, height: bounds.height)
        drawText(
            text.leading,
            color: .white.withAlphaComponent(0.9),
            in: CGRect(x: rowRect.minX, y: rowRect.minY, width: leadingWidth, height: rowRect.height),
            alignRight: false
        )
        drawText(
            text.trailing,
            color: .white.withAlphaComponent(0.72),
            in: CGRect(x: rect.maxX - trailingWidth, y: rowRect.minY, width: trailingWidth, height: rowRect.height),
            alignRight: true
        )

        if hasDetail, let detail = text.detail {
            drawDetailText(
                detail,
                color: .white.withAlphaComponent(0.58),
                in: CGRect(x: rect.minX, y: bounds.minY + 23, width: rect.width, height: 12)
            )
        }
    }

    private func placeholderText(for width: CGFloat) -> (leading: String, trailing: String, detail: String?) {
        let expanded = width >= 176
        guard let statusIssue else {
            if let status {
                return (
                    expanded ? "Usage Meter" : "Usage",
                    NotchStatusFormatting.emptyStateShortLabel(for: status),
                    expanded ? NotchStatusFormatting.emptyStateDetail(for: status) : nil
                )
            }
            return (expanded ? "Usage Meter" : "Usage", "待機中", expanded ? "データ待機中" : nil)
        }
        switch statusIssue {
        case .missing:
            return ("JSON", "未作成", expanded ? statusIssue.detail : nil)
        case .unreadable:
            return ("JSON", "読込失敗", expanded ? statusIssue.detail : nil)
        }
    }

    private func drawProvider(_ provider: ProviderStatus, in rect: CGRect, alignRight: Bool) {
        let percentText = providerValueText(provider)
        let textColor = percentTextColor(for: provider)
        let stale = NotchStatusFormatting.isStale(provider: provider, in: status)

        let font = NSFont.monospacedSystemFont(ofSize: 11, weight: .semibold)
        let attributes: [NSAttributedString.Key: Any] = [
            .font: font,
            .foregroundColor: textColor,
            .kern: 0
        ]
        let size = percentText.size(withAttributes: attributes)
        let iconSize: CGFloat = 14
        let gap: CGFloat = 6
        let hasRefreshError = NotchStatusFormatting.hasRefreshError(provider)
        let isRefreshing = NotchStatusFormatting.isRefreshing(provider)
        let errorIconSize: CGFloat = hasRefreshError ? 9 : 0
        let errorGap: CGFloat = hasRefreshError ? 5 : 0
        let refreshingIconSize: CGFloat = isRefreshing ? 9 : 0
        let refreshingGap: CGFloat = isRefreshing ? 5 : 0
        let staleIconSize: CGFloat = stale ? 9 : 0
        let staleGap: CGFloat = stale ? 5 : 0
        let totalWidth = iconSize + gap + size.width
            + errorGap + errorIconSize
            + refreshingGap + refreshingIconSize
            + staleGap + staleIconSize
        let startX = alignRight ? rect.maxX - totalWidth : rect.minX
        let centerY = bounds.height >= 36 ? bounds.minY + 11 : bounds.minY + 8

        let iconRect = CGRect(
            x: startX,
            y: centerY - iconSize / 2,
            width: iconSize,
            height: iconSize
        )
        drawProviderIcon(provider, in: iconRect)

        let textPoint = CGPoint(
            x: startX + iconSize + gap,
            y: centerY - size.height / 2 + 0.5
        )
        percentText.draw(at: textPoint, withAttributes: attributes)

        var statusIconX = textPoint.x + size.width
        if hasRefreshError {
            statusIconX += errorGap
            let errorRect = CGRect(
                x: statusIconX,
                y: centerY - errorIconSize / 2,
                width: errorIconSize,
                height: errorIconSize
            )
            drawRefreshErrorIcon(in: errorRect)
            statusIconX += errorIconSize
        }

        if isRefreshing {
            statusIconX += refreshingGap
            let refreshingRect = CGRect(
                x: statusIconX,
                y: centerY - refreshingIconSize / 2,
                width: refreshingIconSize,
                height: refreshingIconSize
            )
            drawRefreshingIcon(in: refreshingRect)
            statusIconX += refreshingIconSize
        }

        if stale {
            statusIconX += staleGap
            let staleRect = CGRect(
                x: statusIconX,
                y: centerY - staleIconSize / 2,
                width: staleIconSize,
                height: staleIconSize
            )
            drawStaleIcon(in: staleRect)
        }

        let limits = NotchStatusFormatting.visibleLimits(for: provider)
        guard !limits.isEmpty else {
            return
        }

        let barHeight: CGFloat = bounds.height >= 36 ? 5 : 4
        let barY = bounds.maxY - (bounds.height >= 36 ? 11 : 8) - barHeight
        let itemGap: CGFloat = 8
        let itemWidth = (rect.width - itemGap) / 2
        let firstRect = CGRect(x: rect.minX, y: barY, width: itemWidth, height: barHeight)
        let secondRect = CGRect(
            x: firstRect.maxX + itemGap,
            y: barY,
            width: itemWidth,
            height: barHeight
        )

        drawLimit(limits[0], provider: provider, in: firstRect)
        if limits.count > 1 {
            drawLimit(limits[1], provider: provider, in: secondRect)
        }
    }

    private func drawProviderIcon(_ provider: ProviderStatus, in rect: CGRect) {
        let color = providerIconColor(for: provider)
        let background = NSBezierPath(
            roundedRect: rect,
            xRadius: 4,
            yRadius: 4
        )
        color.withAlphaComponent(0.16).setFill()
        background.fill()

        switch provider.id.lowercased() {
        case "claude":
            drawClaudeIcon(in: rect, color: color)
        case "codex":
            drawCodexIcon(in: rect, color: color)
        default:
            let dot = NSBezierPath(ovalIn: rect.insetBy(dx: 4, dy: 4))
            color.setFill()
            dot.fill()
        }
    }

    private func drawClaudeIcon(in rect: CGRect, color: NSColor) {
        let center = CGPoint(x: rect.midX, y: rect.midY)
        let inset: CGFloat = 3.4
        let path = NSBezierPath()
        path.lineWidth = 1.7
        path.lineCapStyle = .round
        path.move(to: CGPoint(x: center.x, y: rect.minY + inset))
        path.line(to: CGPoint(x: center.x, y: rect.maxY - inset))
        path.move(to: CGPoint(x: rect.minX + inset, y: center.y))
        path.line(to: CGPoint(x: rect.maxX - inset, y: center.y))
        path.move(to: CGPoint(x: rect.minX + 4.4, y: rect.minY + 4.4))
        path.line(to: CGPoint(x: rect.maxX - 4.4, y: rect.maxY - 4.4))
        path.move(to: CGPoint(x: rect.maxX - 4.4, y: rect.minY + 4.4))
        path.line(to: CGPoint(x: rect.minX + 4.4, y: rect.maxY - 4.4))
        color.setStroke()
        path.stroke()
    }

    private func drawCodexIcon(in rect: CGRect, color: NSColor) {
        let outline = NSBezierPath(
            roundedRect: rect.insetBy(dx: 2.5, dy: 2.5),
            xRadius: 2,
            yRadius: 2
        )
        outline.lineWidth = 1.1
        color.withAlphaComponent(0.9).setStroke()
        outline.stroke()

        let glyph = NSBezierPath()
        glyph.lineWidth = 1.4
        glyph.lineCapStyle = .round
        glyph.lineJoinStyle = .round
        glyph.move(to: CGPoint(x: rect.minX + 4.4, y: rect.minY + 5.1))
        glyph.line(to: CGPoint(x: rect.minX + 6.8, y: rect.midY))
        glyph.line(to: CGPoint(x: rect.minX + 4.4, y: rect.maxY - 5.1))
        glyph.move(to: CGPoint(x: rect.minX + 8.2, y: rect.maxY - 4.8))
        glyph.line(to: CGPoint(x: rect.maxX - 3.4, y: rect.maxY - 4.8))
        color.setStroke()
        glyph.stroke()
    }

    private func drawLimit(
        _ limit: LimitStatus,
        provider: ProviderStatus,
        in rect: CGRect
    ) {
        let labelWidth: CGFloat = 18
        let label = shortLimitName(limit.key)
        let labelFont = NSFont.monospacedSystemFont(ofSize: 8, weight: .bold)
        let labelAttributes: [NSAttributedString.Key: Any] = [
            .font: labelFont,
            .foregroundColor: NSColor.white.withAlphaComponent(0.78),
            .kern: 0
        ]
        let labelSize = label.size(withAttributes: labelAttributes)
        label.draw(
            at: CGPoint(x: rect.minX, y: rect.midY - labelSize.height / 2 + 0.5),
            withAttributes: labelAttributes
        )

        let barRect = CGRect(
            x: rect.minX + labelWidth,
            y: rect.minY,
            width: max(16, rect.width - labelWidth),
            height: rect.height
        )
        let track = NSBezierPath(
            roundedRect: barRect,
            xRadius: rect.height / 2,
            yRadius: rect.height / 2
        )
        NSColor.white.withAlphaComponent(0.3).setFill()
        track.fill()

        if let used = limit.percentUsed, used > 0 {
            let usedRatio = CGFloat(clampPercent(used)) / 100
            let fillRect = CGRect(
                x: barRect.minX,
                y: barRect.minY,
                width: max(rect.height, barRect.width * usedRatio),
                height: rect.height
            )
            let fill = NSBezierPath(
                roundedRect: fillRect,
                xRadius: rect.height / 2,
                yRadius: rect.height / 2
            )
            usageColor(for: limit, used: used)
                .withAlphaComponent(NotchStatusFormatting.isStale(provider: provider, in: status) ? 0.58 : 1)
                .setFill()
            fill.fill()
        }

        if let expected = limit.expectedUsed {
            let markerX = barRect.minX + barRect.width * CGFloat(clampPercent(expected)) / 100
            let haloRect = CGRect(
                x: markerX - 1.75,
                y: rect.minY - 2.5,
                width: 3.5,
                height: rect.height + 5
            )
            let halo = NSBezierPath(
                roundedRect: haloRect,
                xRadius: 1.75,
                yRadius: 1.75
            )
            NSColor.black.withAlphaComponent(0.88).setFill()
            halo.fill()

            let markerRect = haloRect.insetBy(dx: 0.9, dy: 0.9)
            let marker = NSBezierPath(
                roundedRect: markerRect,
                xRadius: 0.85,
                yRadius: 0.85
            )
            NSColor(calibratedRed: 1, green: 0.86, blue: 0.25, alpha: 1).setFill()
            marker.fill()
        }
    }

    private func shortLimitName(_ key: String) -> String {
        key == "weekly" ? "W" : "5h"
    }

    private func providerValueText(_ provider: ProviderStatus) -> String {
        if provider.loggedIn == false {
            return "未ログイン"
        }
        return provider.percentRemaining.map { "\($0)%" } ?? "未取得"
    }

    private func providerHeaderWidth(_ provider: ProviderStatus) -> CGFloat {
        let font = NSFont.monospacedSystemFont(ofSize: 11, weight: .semibold)
        let attributes: [NSAttributedString.Key: Any] = [
            .font: font,
            .kern: 0
        ]
        let iconSize: CGFloat = 14
        let gap: CGFloat = 6
        let textWidth = providerValueText(provider).size(withAttributes: attributes).width
        let hasRefreshError = NotchStatusFormatting.hasRefreshError(provider)
        let isRefreshing = NotchStatusFormatting.isRefreshing(provider)
        let stale = NotchStatusFormatting.isStale(provider: provider, in: status)

        return ceil(iconSize + gap + textWidth
            + (hasRefreshError ? 14 : 0)
            + (isRefreshing ? 14 : 0)
            + (stale ? 14 : 0))
    }

    private func drawStaleIcon(in rect: CGRect) {
        let circle = NSBezierPath(ovalIn: rect.insetBy(dx: 0.6, dy: 0.6))
        circle.lineWidth = 1.2
        NSColor.systemYellow.setStroke()
        circle.stroke()

        let center = CGPoint(x: rect.midX, y: rect.midY)
        let hands = NSBezierPath()
        hands.lineWidth = 1.1
        hands.lineCapStyle = .round
        hands.move(to: center)
        hands.line(to: CGPoint(x: center.x, y: rect.minY + 2.2))
        hands.move(to: center)
        hands.line(to: CGPoint(x: rect.maxX - 2.2, y: center.y))
        NSColor.systemYellow.setStroke()
        hands.stroke()
    }

    private func drawRefreshErrorIcon(in rect: CGRect) {
        let circle = NSBezierPath(ovalIn: rect.insetBy(dx: 0.6, dy: 0.6))
        circle.lineWidth = 1.2
        NSColor.systemRed.setStroke()
        circle.stroke()

        let mark = NSBezierPath()
        mark.lineWidth = 1.25
        mark.lineCapStyle = .round
        mark.move(to: CGPoint(x: rect.midX, y: rect.minY + 2.2))
        mark.line(to: CGPoint(x: rect.midX, y: rect.maxY - 3.7))
        NSColor.systemRed.setStroke()
        mark.stroke()

        let dot = NSBezierPath(ovalIn: CGRect(
            x: rect.midX - 0.8,
            y: rect.maxY - 2.4,
            width: 1.6,
            height: 1.6
        ))
        NSColor.systemRed.setFill()
        dot.fill()
    }

    private func drawRefreshingIcon(in rect: CGRect) {
        let ringRect = rect.insetBy(dx: 0.6, dy: 0.6)
        let ring = NSBezierPath(ovalIn: ringRect)
        ring.lineWidth = 1.1
        NSColor.systemBlue.withAlphaComponent(0.34).setStroke()
        ring.stroke()

        let arc = NSBezierPath()
        arc.appendArc(
            withCenter: CGPoint(x: ringRect.midX, y: ringRect.midY),
            radius: ringRect.width / 2,
            startAngle: 35,
            endAngle: 250,
            clockwise: false
        )
        arc.lineWidth = 1.35
        arc.lineCapStyle = .round
        NSColor.systemBlue.setStroke()
        arc.stroke()
    }

    private func clampPercent(_ value: Int) -> Int {
        min(100, max(0, value))
    }

    private func usageColor(for limit: LimitStatus, used: Int) -> NSColor {
        switch limit.pace?.kind {
        case "exhausted", "very-fast":
            return NSColor.systemRed
        case "fast":
            return NSColor.systemOrange
        case "slightly-fast":
            return NSColor(calibratedRed: 0.95, green: 0.72, blue: 0.18, alpha: 1)
        case "steady", "relaxed", "pending":
            return NSColor.systemGreen
        default:
            break
        }

        if used >= 90 {
            return NSColor.systemRed
        }
        if used >= 70 {
            return NSColor.systemOrange
        }
        return NSColor.systemGreen
    }

    private func providerIconColor(for provider: ProviderStatus) -> NSColor {
        guard provider.loggedIn != false else {
            return NSColor.systemGray
        }
        return providerColor(provider.color)
    }

    private func percentTextColor(for provider: ProviderStatus) -> NSColor {
        guard provider.loggedIn != false else {
            return NSColor.white.withAlphaComponent(0.52)
        }
        if NotchStatusFormatting.isStale(provider: provider, in: status) {
            return NSColor.white.withAlphaComponent(0.64)
        }
        guard provider.percentRemaining != nil else {
            return NSColor.white.withAlphaComponent(0.9)
        }
        switch NotchStatusFormatting.providerUrgency(for: provider) {
        case .critical:
            return NSColor.systemRed
        case .warning:
            return NSColor.systemOrange
        case .caution:
            return NSColor(calibratedRed: 0.95, green: 0.72, blue: 0.18, alpha: 1)
        case .normal:
            return NSColor.white.withAlphaComponent(0.94)
        }
    }

    private func providerAccentColor(
        for provider: ProviderStatus,
        urgency: NotchStatusFormatting.ProviderUrgency
    ) -> NSColor {
        switch urgency {
        case .critical:
            return NSColor.systemRed
        case .warning:
            return NSColor.systemOrange
        case .caution:
            return NSColor(calibratedRed: 0.95, green: 0.72, blue: 0.18, alpha: 1)
        case .normal:
            return providerColor(provider.color)
        }
    }

    private func providerStateColor(
        for provider: ProviderStatus,
        urgency: NotchStatusFormatting.ProviderUrgency,
        hasRefreshError: Bool,
        isRefreshing: Bool
    ) -> NSColor {
        if hasRefreshError {
            return NSColor.systemRed
        }
        if isRefreshing {
            return NSColor.systemBlue
        }
        return providerAccentColor(for: provider, urgency: urgency)
    }

    private func borderAlpha(
        stale: Bool,
        hovered: Bool,
        urgency: NotchStatusFormatting.ProviderUrgency,
        hasRefreshError: Bool,
        isRefreshing: Bool
    ) -> CGFloat {
        if hasRefreshError {
            if stale {
                return 0.24
            }
            return hovered ? 0.58 : 0.44
        }
        if isRefreshing {
            if stale {
                return 0.2
            }
            return hovered ? 0.48 : 0.34
        }
        if stale {
            return urgency == .normal ? 0.1 : 0.18
        }
        if hovered {
            return urgency == .normal ? 0.34 : 0.52
        }
        return urgency == .normal ? 0.18 : 0.38
    }

    private func providerColor(_ hex: String?) -> NSColor {
        guard let hex else {
            return NSColor.systemGreen
        }
        return NSColor(hex: hex) ?? NSColor.systemGreen
    }

    private func drawText(_ text: String, color: NSColor, in rect: CGRect, alignRight: Bool) {
        let font = NSFont.systemFont(ofSize: 11, weight: .semibold)
        let style = NSMutableParagraphStyle()
        style.alignment = alignRight ? .right : .left
        style.lineBreakMode = .byTruncatingTail
        let attributes: [NSAttributedString.Key: Any] = [
            .font: font,
            .foregroundColor: color,
            .paragraphStyle: style,
            .kern: 0
        ]
        let size = text.size(withAttributes: attributes)
        let textRect = CGRect(
            x: rect.minX,
            y: rect.midY - size.height / 2 + 0.5,
            width: rect.width,
            height: size.height
        )
        text.draw(in: textRect, withAttributes: attributes)
    }

    private func drawDetailText(_ text: String, color: NSColor, in rect: CGRect) {
        let font = NSFont.systemFont(ofSize: 8.5, weight: .medium)
        let style = NSMutableParagraphStyle()
        style.alignment = .left
        style.lineBreakMode = .byTruncatingTail
        let attributes: [NSAttributedString.Key: Any] = [
            .font: font,
            .foregroundColor: color,
            .paragraphStyle: style,
            .kern: 0
        ]
        let size = text.size(withAttributes: attributes)
        let textRect = CGRect(
            x: rect.minX,
            y: rect.midY - size.height / 2 + 0.5,
            width: rect.width,
            height: size.height
        )
        text.draw(in: textRect, withAttributes: attributes)
    }
}

private extension NSColor {
    convenience init?(hex: String) {
        var raw = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        if raw.hasPrefix("#") {
            raw.removeFirst()
        }
        guard raw.count == 6, let value = Int(raw, radix: 16) else {
            return nil
        }

        let red = CGFloat((value >> 16) & 0xff) / 255
        let green = CGFloat((value >> 8) & 0xff) / 255
        let blue = CGFloat(value & 0xff) / 255
        self.init(calibratedRed: red, green: green, blue: blue, alpha: 1)
    }
}
