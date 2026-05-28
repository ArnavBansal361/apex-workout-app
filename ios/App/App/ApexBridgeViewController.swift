import UIKit
import Capacitor
import WebKit

/// Enables WKWebView edge swipe for history.back() / forward (iOS system gesture).
class ApexBridgeViewController: CAPBridgeViewController {

    override func viewDidLoad() {
        super.viewDidLoad()
        enableWebViewSwipeBack()
    }

    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        enableWebViewSwipeBack()
    }

    private func enableWebViewSwipeBack() {
        if let webView = webView as? WKWebView {
            webView.allowsBackForwardNavigationGestures = true
            webView.allowsLinkPreview = false
        } else {
            webView?.allowsBackForwardNavigationGestures = true
        }
    }
}
