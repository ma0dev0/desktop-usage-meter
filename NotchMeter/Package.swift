// swift-tools-version: 6.0

import PackageDescription

let package = Package(
    name: "NotchMeter",
    platforms: [
        .macOS(.v13)
    ],
    products: [
        .executable(name: "NotchMeter", targets: ["NotchMeter"])
    ],
    targets: [
        .executableTarget(
            name: "NotchMeter"
        )
    ]
)
