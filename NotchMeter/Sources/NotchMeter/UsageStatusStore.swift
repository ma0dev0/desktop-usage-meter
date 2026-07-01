import Foundation

struct NotchStatus: Decodable {
    let schemaVersion: Int
    let updatedAt: Date?
    let refreshing: Bool?
    let providers: [ProviderStatus]
}

struct ProviderStatus: Decodable {
    let id: String
    let name: String
    let color: String?
    let enabled: Bool
    let visible: Bool
    let loggedIn: Bool?
    let percentRemaining: Int?
    let percentUsed: Int?
    let capturedAt: Date?
    let refreshing: Bool?
    let refreshError: RefreshErrorStatus?
    let limits: [LimitStatus]?
}

struct RefreshErrorStatus: Decodable {
    let code: String
    let label: String
    let note: String
    let hasPreviousValue: Bool
}

struct LimitStatus: Decodable {
    let key: String
    let sourceKey: String?
    let label: String
    let percentUsed: Int?
    let percentRemaining: Int?
    let resetText: String?
    let resetAt: Date?
    let resetLabel: String?
    let expectedUsed: Int?
    let pace: PaceStatus?
}

struct PaceStatus: Decodable {
    let kind: String
    let label: String
    let projected: Int?
}

enum UsageStatusIssue: String {
    case missing
    case unreadable

    var title: String {
        switch self {
        case .missing:
            return "JSON未作成"
        case .unreadable:
            return "JSON読み込み失敗"
        }
    }

    var detail: String {
        switch self {
        case .missing:
            return "Usage Meter 本体の出力待ち"
        case .unreadable:
            return "JSON形式を確認してください"
        }
    }
}

@MainActor
final class UsageStatusStore {
    private let decoder: JSONDecoder
    private(set) var statusPath: String
    private var lastModifiedAt: Date?
    private var timer: Timer?

    var onChange: ((NotchStatus?, UsageStatusIssue?) -> Void)?

    init(statusPath: String? = nil) {
        self.statusPath = statusPath ?? UsageStatusStore.defaultStatusPath()
        self.decoder = JSONDecoder()
        self.decoder.dateDecodingStrategy = .iso8601
    }

    func start() {
        load(force: true)
        timer = Timer.scheduledTimer(withTimeInterval: 1.5, repeats: true) { [weak self] _ in
            Task { @MainActor in
                self?.load(force: false)
            }
        }
    }

    func stop() {
        timer?.invalidate()
        timer = nil
    }

    func reload() {
        load(force: true)
    }

    private func load(force: Bool) {
        let fileURL = URL(fileURLWithPath: statusPath)
        guard let attributes = try? FileManager.default.attributesOfItem(atPath: statusPath) else {
            let hadFile = lastModifiedAt != nil
            lastModifiedAt = nil
            if force || hadFile {
                onChange?(nil, .missing)
            }
            return
        }

        let modifiedAt = attributes[.modificationDate] as? Date
        if !force && modifiedAt == lastModifiedAt {
            return
        }
        lastModifiedAt = modifiedAt

        do {
            let data = try Data(contentsOf: fileURL)
            let status = try decoder.decode(NotchStatus.self, from: data)
            onChange?(status, nil)
        } catch {
            onChange?(nil, .unreadable)
        }
    }

    private static func defaultStatusPath() -> String {
        if let explicit = ProcessInfo.processInfo.environment["USAGE_METER_STATUS_PATH"], !explicit.isEmpty {
            return NSString(string: explicit).expandingTildeInPath
        }

        let home = FileManager.default.homeDirectoryForCurrentUser.path
        let candidates = [
            "\(home)/Library/Application Support/desktop-usage-meter/notch-status.json",
            "\(home)/Library/Application Support/Usage Meter/notch-status.json",
            "\(home)/Library/Application Support/DesktopUsageMeter/notch-status.json"
        ]

        return candidates.first(where: { FileManager.default.fileExists(atPath: $0) }) ?? candidates[0]
    }
}
