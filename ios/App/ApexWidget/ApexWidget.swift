import WidgetKit
import SwiftUI

private let accentBlue = Color(red: 61 / 255, green: 122 / 255, blue: 181 / 255)
private let widgetBackground = Color(red: 0.035, green: 0.051, blue: 0.078)
private let appGroupSuite = "group.com.arnav.apex"
private let supportedMuscles = ["Chest", "Back", "Legs", "Shoulders", "Arms", "Core"]

struct ApexEntry: TimelineEntry {
    let date: Date
    let todayStatus: String
    let streakCount: Int
    let sessionsThisWeek: Int
    let setsThisWeek: Int
    let weeklyVolume: Int
    let volumeBalance: [String: Double]
    let nextWorkoutName: String?
    let nextWorkoutTags: [String]
}

struct Provider: TimelineProvider {
    func placeholder(in context: Context) -> ApexEntry {
      return ApexEntry(
            date: Date(),
            todayStatus: "Rest day",
            streakCount: 0,
            sessionsThisWeek: 0,
            setsThisWeek: 0,
            weeklyVolume: 0,
            volumeBalance: defaultVolumeBalance(),
            nextWorkoutName: nil,
            nextWorkoutTags: []
        )
    }

    func getSnapshot(in context: Context, completion: @escaping (ApexEntry) -> Void) {
        completion(makeEntry())
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<ApexEntry>) -> Void) {
        let entry = makeEntry()
        completion(Timeline(entries: [entry], policy: .atEnd))
    }

    private func makeEntry() -> ApexEntry {
        let defaults = UserDefaults(suiteName: appGroupSuite)
        ApexEntry(
            date: Date(),
            todayStatus: getTodayStatus(defaults),
            streakCount: max(0, defaults?.integer(forKey: "streakCount") ?? 0),
            sessionsThisWeek: max(0, defaults?.integer(forKey: "sessionsThisWeek") ?? 0),
            setsThisWeek: max(0, defaults?.integer(forKey: "setsThisWeek") ?? 0),
            weeklyVolume: max(0, defaults?.integer(forKey: "weeklyVolume") ?? 0),
            volumeBalance: getVolumeBalance(defaults),
            nextWorkoutName: getOptionalString(defaults, key: "nextWorkoutName"),
            nextWorkoutTags: getStringArray(defaults, key: "nextWorkoutTags")
        )
    }

    private func getTodayStatus(_ defaults: UserDefaults?) -> String {
        let status = defaults?.string(forKey: "todayStatus")?.trimmingCharacters(in: .whitespacesAndNewlines)
        if status == "Workout day" || status == "Rest day" {
            return status ?? "Rest day"
        }
        return "Rest day"
    }

    private func getOptionalString(_ defaults: UserDefaults?, key: String) -> String? {
        let value = defaults?.string(forKey: key)?.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let value, !value.isEmpty else { return nil }
        return value
    }

    private func getStringArray(_ defaults: UserDefaults?, key: String) -> [String] {
        guard let raw = defaults?.string(forKey: key), let data = raw.data(using: .utf8) else { return [] }
        if let arr = try? JSONDecoder().decode([String].self, from: data) {
            return arr.map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }
        }
        return []
    }

    private func getVolumeBalance(_ defaults: UserDefaults?) -> [String: Double] {
        guard let raw = defaults?.string(forKey: "volumeBalance"), let data = raw.data(using: .utf8) else {
            return defaultVolumeBalance()
        }
        guard let decoded = try? JSONDecoder().decode([String: Double].self, from: data) else {
            return defaultVolumeBalance()
        }
        var normalized = defaultVolumeBalance()
        for muscle in supportedMuscles {
            let value = decoded[muscle] ?? 0
            normalized[muscle] = min(max(value, 0), 1)
        }
        return normalized
    }
}

private func defaultVolumeBalance() -> [String: Double] {
    var out: [String: Double] = [:]
    for muscle in supportedMuscles {
        out[muscle] = 0
    }
    return out
}

private struct ApexMountainMark: View {
    let size: CGFloat

    var body: some View {
        Image(systemName: "mountain.2.fill")
            .font(.system(size: size, weight: .semibold))
            .foregroundColor(.white)
    }
}

// MARK: - Widget views

struct ApexWidgetEntryView: View {
    @Environment(\.widgetFamily) var family
    let entry: ApexEntry

    var body: some View {
        Group {
            switch family {
            case .systemSmall:
                ApexWidgetSmallView(entry: entry)
            case .systemMedium:
                ApexWidgetMediumView(entry: entry)
            case .systemLarge:
                ApexWidgetLargeView(entry: entry)
            default:
                ApexWidgetSmallView(entry: entry)
            }
        }
        .containerBackground(widgetBackground, for: .widget)
        .widgetURL(URL(string: "apex://today"))
    }
}

struct ApexWidgetSmallView: View {
    let entry: ApexEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ApexMountainMark(size: 16)
            Spacer()
            Text(entry.todayStatus)
                .font(.system(size: 18, weight: .semibold))
                .foregroundColor(.white)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
                .frame(maxWidth: .infinity, alignment: .center)
            Spacer()
            HStack(spacing: 4) {
                Image(systemName: "flame.fill")
                Text("\(entry.streakCount)")
            }
            .font(.system(size: 13, weight: .semibold))
            .foregroundColor(accentBlue)
        }
        .padding(14)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .containerBackground(widgetBackground, for: .widget)
    }
}

struct ApexWidgetMediumView: View {
    let entry: ApexEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 6) {
                ApexMountainMark(size: 14)
                Text("APEX")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundColor(.white.opacity(0.55))
            }

            HStack(alignment: .top, spacing: 12) {
                Text(entry.todayStatus)
                    .font(.system(size: 20, weight: .bold))
                    .foregroundColor(.white)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .lineLimit(2)

                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                    statCell(value: "\(entry.sessionsThisWeek)", label: "Sessions this week")
                    statCell(value: "\(entry.setsThisWeek)", label: "Sets this week")
                    statCell(value: "\(entry.weeklyVolume)", label: "Weekly volume")
                    statCell(value: "\(entry.streakCount)", label: "Streak")
                }
                .frame(width: 145, alignment: .trailing)
            }

            Spacer()
        }
        .padding(16)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .containerBackground(widgetBackground, for: .widget)
    }

    @ViewBuilder
    private func statCell(value: String, label: String) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(value)
                .font(.system(size: 16, weight: .semibold))
                .foregroundColor(.white)
            Text(label)
                .font(.system(size: 10, weight: .medium))
                .foregroundColor(.white.opacity(0.55))
                .lineLimit(1)
                .minimumScaleFactor(0.65)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct ApexWidgetLargeView: View {
    let entry: ApexEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 6) {
                ApexMountainMark(size: 14)
                Text("APEX")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundColor(.white.opacity(0.55))
            }

            HStack(alignment: .top, spacing: 12) {
                Text(entry.todayStatus)
                    .font(.system(size: 20, weight: .bold))
                    .foregroundColor(.white)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .lineLimit(2)

                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                    statCell(value: "\(entry.sessionsThisWeek)", label: "Sessions this week")
                    statCell(value: "\(entry.setsThisWeek)", label: "Sets this week")
                    statCell(value: "\(entry.weeklyVolume)", label: "Weekly volume")
                    statCell(value: "\(entry.streakCount)", label: "Streak")
                }
                .frame(width: 145, alignment: .trailing)
            }

            VStack(alignment: .leading, spacing: 8) {
                Text("VOLUME BALANCE")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundColor(.white.opacity(0.55))
                ForEach(supportedMuscles, id: \.self) { muscle in
                    volumeRow(muscle: muscle, ratio: entry.volumeBalance[muscle] ?? 0)
                }
            }

            VStack(alignment: .leading, spacing: 6) {
                Text("NEXT WORKOUT")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundColor(.white.opacity(0.55))
                if let name = entry.nextWorkoutName, !name.isEmpty {
                    Text(name)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(.white)
                        .lineLimit(2)
                    if !entry.nextWorkoutTags.isEmpty {
                        HStack(spacing: 6) {
                            ForEach(entry.nextWorkoutTags.prefix(4), id: \.self) { tag in
                                Text(tag)
                                    .font(.system(size: 10, weight: .semibold))
                                    .foregroundColor(accentBlue)
                                    .padding(.horizontal, 8)
                                    .padding(.vertical, 4)
                                    .background(accentBlue.opacity(0.16))
                                    .clipShape(Capsule())
                            }
                        }
                    }
                } else {
                    Text("No workout planned")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(.white.opacity(0.55))
                }
            }
        }
        .padding(20)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .containerBackground(widgetBackground, for: .widget)
    }

    @ViewBuilder
    private func statCell(value: String, label: String) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(value)
                .font(.system(size: 16, weight: .semibold))
                .foregroundColor(.white)
            Text(label)
                .font(.system(size: 10, weight: .medium))
                .foregroundColor(.white.opacity(0.55))
                .lineLimit(1)
                .minimumScaleFactor(0.65)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    @ViewBuilder
    private func volumeRow(muscle: String, ratio: Double) -> some View {
        HStack(spacing: 8) {
            Text(muscle)
                .font(.system(size: 10, weight: .medium))
                .foregroundColor(.white.opacity(0.7))
                .frame(width: 70, alignment: .leading)

            GeometryReader { geo in
                let clamped = min(max(ratio, 0), 1)
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 2)
                        .fill(Color.white.opacity(0.1))
                        .frame(height: 4)
                    RoundedRectangle(cornerRadius: 2)
                        .fill(accentBlue)
                        .frame(width: geo.size.width * clamped, height: 4)
                }
            }
            .frame(height: 4)

            Text("\(Int((min(max(ratio, 0), 1) * 100).rounded()))%")
                .font(.system(size: 11, weight: .semibold))
                .foregroundColor(.white)
                .frame(width: 36, alignment: .trailing)
        }
        .frame(height: 12)
    }
}

@main
struct ApexWidget: Widget {
    let kind: String = "ApexWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: Provider()) { entry in
            ApexWidgetEntryView(entry: entry)
        }
        .configurationDisplayName("Apex")
        .description("Today's workout and streak.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}