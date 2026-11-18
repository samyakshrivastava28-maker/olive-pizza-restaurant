import Foundation
import CallKit
import AVFoundation

/**
 * OrderCallKitService — Native iOS CallKit implementation for urgent order alerts.
 * Displays high-urgency incoming order UI / banner for kitchen managers and riders.
 */
@objc public class OrderCallKitService: NSObject, CXProviderDelegate {
    @objc public static let shared = OrderCallKitService()
    private var provider: CXProvider?
    private var callController = CXCallController()
    
    private override init() {
        super.init()
        let configuration = CXProviderConfiguration(localizedName: "Olive Pizza Kitchen")
        configuration.supportsVideo = false
        configuration.maximumCallsPerCallGroup = 1
        configuration.supportedHandleTypes = [.generic]
        configuration.ringtoneSound = "new_order.wav"
        
        provider = CXProvider(configuration: configuration)
        provider?.setDelegate(self, queue: nil)
    }
    
    @objc public func reportIncomingOrder(orderId: String, orderNumber: String, customerName: String, totalAmount: String) {
        let update = CXCallUpdate()
        update.remoteHandle = CXHandle(type: .generic, value: "Order \(orderNumber) • ₹\(totalAmount)")
        update.localizedCallerName = "🔔 New Order: \(orderNumber) (\(customerName))"
        update.hasVideo = false
        
        let uuid = UUID(uuidString: orderId) ?? UUID()
        provider?.reportNewIncomingCall(with: uuid, update: update) { error in
            if let error = error {
                NSLog("[CallKit] Error reporting incoming order: %@", error.localizedDescription)
            } else {
                NSLog("[CallKit] Incoming order alert displayed for %@", orderNumber)
            }
        }
    }
    
    @objc public func endIncomingOrder(orderId: String) {
        let uuid = UUID(uuidString: orderId) ?? UUID()
        let endAction = CXEndCallAction(call: uuid)
        let transaction = CXTransaction(action: endAction)
        callController.request(transaction) { error in
            if let error = error {
                NSLog("[CallKit] Error ending order alert: %@", error.localizedDescription)
            }
        }
    }
    
    public func providerDidReset(_ provider: CXProvider) {}
    
    public func provider(_ provider: CXProvider, perform action: CXAnswerCallAction) {
        NotificationCenter.default.post(
            name: Notification.Name("OrderCallKitAnswered"),
            object: ["orderId": action.callUUID.uuidString]
        )
        action.fulfill()
    }
    
    public func provider(_ provider: CXProvider, perform action: CXEndCallAction) {
        NotificationCenter.default.post(
            name: Notification.Name("OrderCallKitRejected"),
            object: ["orderId": action.callUUID.uuidString]
        )
        action.fulfill()
    }
}
