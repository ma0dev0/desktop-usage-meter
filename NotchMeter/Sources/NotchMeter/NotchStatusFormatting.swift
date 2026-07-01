import Foundation

enum NotchStatusFormatting {
    enum ProviderUrgency: Equatable {
        case normal
        case caution
        case warning
        case critical
    }

    static let staleAfter: TimeInterval = 15 * 60

    private static let limitOrder = [
        "fivehour": 0,
        "weekly": 1
    ]

    static func visibleProviders(in status: NotchStatus?) -> [ProviderStatus] {
        guard let status else {
            return []
        }
        return Array(status.providers.filter { $0.enabled && $0.visible }.prefix(2))
    }

    static func visibleLimits(for provider: ProviderStatus) -> [LimitStatus] {
        (provider.limits ?? [])
            .filter { limitOrder[$0.key] != nil }
            .sorted { (limitOrder[$0.key] ?? 99) < (limitOrder[$1.key] ?? 99) }
    }

    static func isStale(provider: ProviderStatus, in status: NotchStatus?) -> Bool {
        guard let date = provider.capturedAt ?? status?.updatedAt else {
            return false
        }
        return Date().timeIntervalSince(date) >= staleAfter
    }

    static func isStale(status: NotchStatus) -> Bool {
        guard let date = latestUpdateDate(for: status) else {
            return false
        }
        return Date().timeIntervalSince(date) >= staleAfter
    }

    static func hasRefreshError(_ provider: ProviderStatus) -> Bool {
        provider.refreshError != nil
    }

    static func isRefreshing(_ provider: ProviderStatus) -> Bool {
        provider.refreshing == true
    }

    static func latestUpdateDate(for status: NotchStatus) -> Date? {
        let providerDates = visibleProviders(in: status).compactMap { $0.capturedAt }
        if let latestProviderDate = providerDates.max() {
            return latestProviderDate
        }
        return status.updatedAt
    }

    static func freshnessLabel(for status: NotchStatus) -> String {
        guard let date = latestUpdateDate(for: status) else {
            return "更新時刻を取得できません"
        }
        let relative = compactElapsedLabel(since: date)
        if status.refreshing == true {
            return "取得中...（更新 \(relative)前）"
        }
        return isStale(status: status) ? "データが古い（\(relative)前）" : "更新 \(relative)前"
    }

    static func providerSummary(_ provider: ProviderStatus, in status: NotchStatus) -> String {
        var parts = [provider.name]
        if isRefreshing(provider) {
            parts.append("取得中")
        }
        if let refreshNote = refreshErrorNote(for: provider) {
            parts.append(refreshNote)
        }
        if isStale(provider: provider, in: status) {
            parts.append("古いデータ")
        }

        guard provider.loggedIn != false else {
            parts.append("未ログイン")
            return parts.joined(separator: " / ")
        }
        guard let remaining = provider.percentRemaining else {
            parts.append("未取得")
            return parts.joined(separator: " / ")
        }

        let percent = "\(remaining)%"
        parts.append("残り \(percent)")
        guard let limit = mostUrgentLimit(for: provider) else {
            return parts.joined(separator: " / ")
        }
        guard riskScore(for: limit) < 4 else {
            return parts.joined(separator: " / ")
        }
        parts.append("注意: \(limit.label) \(paceLabel(for: limit))")
        return parts.joined(separator: " / ")
    }

    static func providerUrgency(for provider: ProviderStatus) -> ProviderUrgency {
        if let limit = mostUrgentLimit(for: provider) {
            switch riskScore(for: limit) {
            case 0...1:
                return .critical
            case 2:
                return .warning
            case 3:
                return .caution
            default:
                return .normal
            }
        }

        guard let remaining = provider.percentRemaining else {
            return .normal
        }
        if remaining <= 10 {
            return .critical
        }
        if remaining <= 30 {
            return .warning
        }
        return .normal
    }

    static func limitSummary(_ limit: LimitStatus) -> String {
        let used = limit.percentUsed.map { "使用\($0)%" } ?? "使用--"
        let expected = limit.expectedUsed.map { "目安\($0)%" } ?? "目安--"
        let reset = compactResetLabel(limit.resetLabel)
        return [limit.label, paceLabel(for: limit), used, expected, reset]
            .filter { !$0.isEmpty }
            .joined(separator: " / ")
    }

    static func emptyStateShortLabel(for status: NotchStatus) -> String {
        let info = emptyStateInfo(for: status)
        return info.short
    }

    static func emptyStateDetail(for status: NotchStatus) -> String? {
        let info = emptyStateInfo(for: status)
        return info.detail
    }

    static func emptyStateLines(for status: NotchStatus) -> [String] {
        let info = emptyStateInfo(for: status)
        return [info.label, info.detail]
            .compactMap { $0 }
            .filter { !$0.isEmpty }
    }

    static func tooltipText(for status: NotchStatus?, issue: UsageStatusIssue? = nil) -> String {
        guard let status else {
            return fallbackText(for: issue)
        }

        let providers = visibleProviders(in: status)
        guard !providers.isEmpty else {
            return (["Usage Meter"] + emptyStateLines(for: status)).joined(separator: "\n")
        }

        var lines: [String] = ["Usage Meter", freshnessLabel(for: status)]
        for provider in providers {
            lines.append(providerSummary(provider, in: status))
            for limit in visibleLimits(for: provider) {
                lines.append("  \(limitSummary(limit))")
            }
        }
        return lines.joined(separator: "\n")
    }

    static func accessibilityText(for status: NotchStatus?, issue: UsageStatusIssue? = nil) -> String {
        tooltipText(for: status, issue: issue)
            .split(separator: "\n")
            .map { String($0).trimmingCharacters(in: .whitespacesAndNewlines) }
            .joined(separator: "。 ")
    }

    static func statusSummaryText(for status: NotchStatus?, issue: UsageStatusIssue? = nil) -> String {
        guard let status else {
            return fallbackText(for: issue)
        }

        let providers = visibleProviders(in: status)
        guard !providers.isEmpty else {
            return (["Usage Meter"] + emptyStateLines(for: status)).joined(separator: "\n")
        }

        var lines = ["Usage Meter", freshnessLabel(for: status)]
        for provider in providers {
            lines.append(providerSummary(provider, in: status))
            for limit in visibleLimits(for: provider) {
                lines.append("  \(limitSummary(limit))")
            }
        }
        return lines.joined(separator: "\n")
    }

    private static func fallbackText(for issue: UsageStatusIssue?) -> String {
        guard let issue else {
            return "Usage Meter\nデータ待機中"
        }
        return "Usage Meter\n\(issue.title)\n\(issue.detail)"
    }

    private static func emptyStateInfo(for status: NotchStatus) -> (short: String, label: String, detail: String?) {
        guard !status.providers.isEmpty else {
            return ("サービスなし", "サービスなし", nil)
        }

        let enabledProviders = status.providers.filter { $0.enabled }
        guard !enabledProviders.isEmpty else {
            return ("対象OFF", "対象サービスがOFFです", "本体で対象サービスをON")
        }

        let hiddenLoginProviders = enabledProviders
            .filter { !$0.visible && $0.loggedIn == false }
            .map { "\($0.name): 未ログイン" }

        if hiddenLoginProviders.count == enabledProviders.count && !hiddenLoginProviders.isEmpty {
            return ("ログイン待ち", "ログインが必要です", hiddenLoginProviders.joined(separator: " / "))
        }

        return ("サービスなし", "サービスなし", nil)
    }

    private static func mostUrgentLimit(for provider: ProviderStatus) -> LimitStatus? {
        visibleLimits(for: provider).min { lhs, rhs in
            riskScore(for: lhs) < riskScore(for: rhs)
        }
    }

    private static func riskScore(for limit: LimitStatus) -> Int {
        switch limit.pace?.kind {
        case "exhausted":
            return 0
        case "very-fast":
            return 1
        case "fast":
            return 2
        case "slightly-fast":
            return 3
        default:
            break
        }
        if let remaining = limit.percentRemaining {
            if remaining <= 10 {
                return 0
            }
            if remaining <= 30 {
                return 2
            }
        }
        return 4
    }

    private static func compactElapsedLabel(since date: Date) -> String {
        let seconds = max(0, Int(Date().timeIntervalSince(date)))
        if seconds < 60 {
            return "\(max(1, seconds))秒"
        }
        let minutes = seconds / 60
        if minutes < 60 {
            return "\(minutes)分"
        }
        let hours = minutes / 60
        if hours < 24 {
            return "\(hours)時間"
        }
        return "\(hours / 24)日"
    }

    private static func paceLabel(for limit: LimitStatus) -> String {
        guard let label = limit.pace?.label, !label.isEmpty else {
            return "判定中"
        }
        return label
    }

    private static func refreshErrorNote(for provider: ProviderStatus) -> String? {
        guard let error = provider.refreshError else {
            return nil
        }
        if !error.note.isEmpty {
            return error.note.replacingOccurrences(of: " · ", with: " / ")
        }
        if !error.label.isEmpty {
            return error.hasPreviousValue ? "\(error.label) / 前回値を表示" : error.label
        }
        return error.hasPreviousValue ? "取得失敗 / 前回値を表示" : "取得失敗"
    }

    private static func compactResetLabel(_ resetLabel: String?) -> String {
        guard let resetLabel, !resetLabel.isEmpty else {
            return ""
        }
        return resetLabel
            .replacingOccurrences(of: "にリセット（あと", with: "まで")
            .replacingOccurrences(of: "）", with: "")
            .replacingOccurrences(of: "にリセット済み", with: "リセット済み")
            .replacingOccurrences(of: "にリセット", with: "リセット")
    }
}
