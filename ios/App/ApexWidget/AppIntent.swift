import AppIntents
import WidgetKit

struct ConfigurationAppIntent: WidgetConfigurationIntent {
    static var title: LocalizedStringResource { "Apex" }
    static var description: IntentDescription { "Today's workout, streak, and weekly stats." }
}
