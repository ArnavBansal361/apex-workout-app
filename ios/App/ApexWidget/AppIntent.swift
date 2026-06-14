import AppIntents
import WidgetKit

struct ConfigurationAppIntent: WidgetConfigurationIntent {
    static var title: LocalizedStringResource { "Lift" }
    static var description: IntentDescription { "Today's workout, streak, and weekly stats." }
}
