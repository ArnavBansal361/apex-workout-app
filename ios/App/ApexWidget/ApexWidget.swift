import WidgetKit
import SwiftUI

struct ApexEntry: TimelineEntry {
    let date: Date
    let workoutName: String
    let streak: Int
}

struct Provider: TimelineProvider {
    func placeholder(in context: Context) -> ApexEntry {
        ApexEntry(date: Date(), workoutName: "Push Day", streak: 7)
    }

    func getSnapshot(in context: Context, completion: @escaping (ApexEntry) -> Void) {
        let entry = ApexEntry(date: Date(), workoutName: getWorkoutName(), streak: getStreak())
        completion(entry)
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<ApexEntry>) -> Void) {
        let entry = ApexEntry(date: Date(), workoutName: getWorkoutName(), streak: getStreak())
        let timeline = Timeline(entries: [entry], policy: .atEnd)
        completion(timeline)
    }

    func getWorkoutName() -> String {
        let defaults = UserDefaults(suiteName: "group.com.arnav.apex")
        return defaults?.string(forKey: "todayWorkout") ?? "Rest day"
    }

    func getStreak() -> Int {
        let defaults = UserDefaults(suiteName: "group.com.arnav.apex")
        return defaults?.integer(forKey: "currentStreak") ?? 0
    }
}

// SMALL WIDGET
struct SmallWidgetView: View {
    let entry: ApexEntry
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Image(systemName: "mountain.2.fill")
                    .foregroundColor(.white)
                    .font(.system(size: 14, weight: .medium))
                Spacer()
                Text("APEX")
                    .font(.system(size: 10, weight: .medium))
                    .foregroundColor(.white.opacity(0.5))
            }
            Spacer()
            Text("\(entry.streak)d streak")
                .font(.system(size: 11, weight: .medium))
                .foregroundColor(.white.opacity(0.5))
            Text(entry.workoutName)
                .font(.system(size: 16, weight: .medium))
                .foregroundColor(.white)
                .lineLimit(2)
        }
        .padding(14)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .background(Color(red: 9/255, green: 13/255, blue: 20/255))
    }
}

// MEDIUM WIDGET
struct MediumWidgetView: View {
    let entry: ApexEntry
    var body: some View {
        HStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Image(systemName: "mountain.2.fill")
                        .foregroundColor(.white)
                        .font(.system(size: 14, weight: .medium))
                    Text("APEX")
                        .font(.system(size: 10, weight: .medium))
                        .foregroundColor(.white.opacity(0.5))
                }
                Spacer()
                Text("\(entry.streak)d streak")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(.white.opacity(0.5))
                Text(entry.workoutName)
                    .font(.system(size: 18, weight: .medium))
                    .foregroundColor(.white)
                    .lineLimit(2)
            }
            .padding(14)
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .background(Color(red: 9/255, green: 13/255, blue: 20/255))
    }
}

// LARGE WIDGET
struct LargeWidgetView: View {
    let entry: ApexEntry
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Image(systemName: "mountain.2.fill")
                    .foregroundColor(.white)
                    .font(.system(size: 16, weight: .medium))
                Text("APEX")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(.white.opacity(0.5))
                Spacer()
                Text(Date(), style: .date)
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(.white.opacity(0.5))
            }
            Divider().background(Color.white.opacity(0.08))
            Text("\(entry.streak)d streak")
                .font(.system(size: 12, weight: .medium))
                .foregroundColor(.white.opacity(0.5))
            Text(entry.workoutName)
                .font(.system(size: 24, weight: .medium))
                .foregroundColor(.white)
            Spacer()
        }
        .padding(16)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .background(Color(red: 9/255, green: 13/255, blue: 20/255))
    }
}

struct ApexWidgetEntryView: View {
    @Environment(\.widgetFamily) var family
    var entry: ApexEntry

    var body: some View {
        switch family {
        case .systemSmall:
            SmallWidgetView(entry: entry)
        case .systemMedium:
            MediumWidgetView(entry: entry)
        case .systemLarge:
            LargeWidgetView(entry: entry)
        default:
            SmallWidgetView(entry: entry)
        }
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
