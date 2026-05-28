import WidgetKit
import SwiftUI

private let accentBlue = Color(red: 61 / 255, green: 122 / 255, blue: 181 / 255)

struct ApexEntry: TimelineEntry {
    let date: Date
    let workoutName: String
    let streak: Int
    var dateLabel: String {
        Self.dateFormatter.string(from: date)
    }

    private static let dateFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "EEE, MMM d"
        return f
    }()
}

struct Provider: TimelineProvider {
    func placeholder(in context: Context) -> ApexEntry {
        ApexEntry(date: Date(), workoutName: "Rest day", streak: 0)
    }

    func getSnapshot(in context: Context, completion: @escaping (ApexEntry) -> Void) {
        completion(makeEntry())
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<ApexEntry>) -> Void) {
        let entry = makeEntry()
        completion(Timeline(entries: [entry], policy: .atEnd))
    }

    private func makeEntry() -> ApexEntry {
        ApexEntry(
            date: Date(),
            workoutName: getWorkoutName(),
            streak: getStreak()
        )
    }

    private func getWorkoutName() -> String {
        let defaults = UserDefaults(suiteName: "group.com.arnav.apex")
        let name = defaults?.string(forKey: "todayWorkout")?.trimmingCharacters(in: .whitespacesAndNewlines)
        if let name, !name.isEmpty { return name }
        return "Rest day"
    }

    private func getStreak() -> Int {
        let defaults = UserDefaults(suiteName: "group.com.arnav.apex")
        return max(0, defaults?.integer(forKey: "currentStreak") ?? 0)
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
        .containerBackground(Color(red: 0.035, green: 0.051, blue: 0.078), for: .widget)
    }
}

struct ApexWidgetSmallView: View {
    let entry: ApexEntry
    private var isRestDay: Bool {
        let lower = entry.workoutName.lowercased()
        return lower.isEmpty || lower == "rest" || lower == "rest day"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(entry.dateLabel)
                .font(.system(size: 11, weight: .medium))
                .foregroundColor(.white.opacity(0.55))

            HStack(alignment: .firstTextBaseline, spacing: 4) {
                Text("\(entry.streak)")
                    .font(.system(size: 28, weight: .semibold, design: .rounded))
                    .foregroundColor(accentBlue)
                Text(entry.streak == 1 ? "day" : "days")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(.white.opacity(0.55))
            }

            Spacer(minLength: 4)

            HStack(spacing: 6) {
                Circle()
                    .fill(isRestDay ? Color.white.opacity(0.35) : accentBlue)
                    .frame(width: 6, height: 6)
                Text(isRestDay ? "Rest day" : "Workout day")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(.white)
                    .lineLimit(1)
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }
}

struct ApexWidgetMediumView: View {
    let entry: ApexEntry
    private var isRestDay: Bool {
        let lower = entry.workoutName.lowercased()
        return lower.isEmpty || lower == "rest" || lower == "rest day"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(entry.dateLabel)
                .font(.system(size: 12, weight: .medium))
                .foregroundColor(.white.opacity(0.55))

            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text("\(entry.streak)")
                    .font(.system(size: 36, weight: .semibold, design: .rounded))
                    .foregroundColor(accentBlue)
                Text(entry.streak == 1 ? "day streak" : "day streaks")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundColor(.white.opacity(0.55))
            }

            HStack(spacing: 8) {
                Circle()
                    .fill(isRestDay ? Color.white.opacity(0.35) : accentBlue)
                    .frame(width: 8, height: 8)
                Text(isRestDay ? "Rest day" : "Workout day")
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundColor(.white)
            }

            Spacer()
        }
        .padding(16)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }
}

struct ApexWidgetLargeView: View {
    let entry: ApexEntry
    private var isRestDay: Bool {
        let lower = entry.workoutName.lowercased()
        return lower.isEmpty || lower == "rest" || lower == "rest day"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text(entry.dateLabel)
                .font(.system(size: 13, weight: .medium))
                .foregroundColor(.white.opacity(0.55))

            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text("\(entry.streak)")
                    .font(.system(size: 44, weight: .semibold, design: .rounded))
                    .foregroundColor(accentBlue)
                Text(entry.streak == 1 ? "day streak" : "day streaks")
                    .font(.system(size: 15, weight: .medium))
                    .foregroundColor(.white.opacity(0.55))
            }

            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 8) {
                    Circle()
                        .fill(isRestDay ? Color.white.opacity(0.35) : accentBlue)
                        .frame(width: 10, height: 10)
                    Text(isRestDay ? "Rest day" : "Workout day")
                        .font(.system(size: 22, weight: .semibold))
                        .foregroundColor(.white)
                }
            }

            Spacer()
        }
        .padding(20)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
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