import Foundation
import ActivityKit

/**
 * OrderActivityAttributes — Native iOS ActivityKit definition for dynamic order tracking.
 */
public struct OrderActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        public var status: String
        public var etaMinutes: Int
        public var step: Int
        public var riderName: String
        public var riderPhone: String
        
        public init(status: String, etaMinutes: Int, step: Int, riderName: String = "", riderPhone: String = "") {
            self.status = status
            self.etaMinutes = etaMinutes
            self.step = step
            self.riderName = riderName
            self.riderPhone = riderPhone
        }
    }

    public var orderId: String
    public var orderNumber: String
    public var totalAmount: String
    
    public init(orderId: String, orderNumber: String, totalAmount: String) {
        self.orderId = orderId
        self.orderNumber = orderNumber
        self.totalAmount = totalAmount
    }
}

@objc public class OrderActivityKitService: NSObject {
    @objc public static let shared = OrderActivityKitService()
    
    @objc public func startOrderActivity(orderId: String, orderNumber: String, totalAmount: String, status: String, etaMinutes: Int, step: Int) {
        if #available(iOS 16.1, *) {
            let attributes = OrderActivityAttributes(orderId: orderId, orderNumber: orderNumber, totalAmount: totalAmount)
            let initialContentState = OrderActivityAttributes.ContentState(status: status, etaMinutes: etaMinutes, step: step)
            
            do {
                _ = try Activity<OrderActivityAttributes>.request(
                    attributes: attributes,
                    contentState: initialContentState,
                    pushType: .token
                )
                NSLog("[ActivityKit] Started Live Activity for Order: %@", orderNumber)
            } catch {
                NSLog("[ActivityKit] Error requesting Live Activity: %@", error.localizedDescription)
            }
        }
    }
    
    @objc public func updateOrderActivity(orderId: String, status: String, etaMinutes: Int, step: Int) {
        if #available(iOS 16.1, *) {
            Task {
                for activity in Activity<OrderActivityAttributes>.activities where activity.attributes.orderId == orderId {
                    let updatedState = OrderActivityAttributes.ContentState(status: status, etaMinutes: etaMinutes, step: step)
                    await activity.update(using: updatedState)
                    NSLog("[ActivityKit] Updated Live Activity for Order: %@", orderId)
                }
            }
        }
    }
    
    @objc public func endOrderActivity(orderId: String) {
        if #available(iOS 16.1, *) {
            Task {
                for activity in Activity<OrderActivityAttributes>.activities where activity.attributes.orderId == orderId {
                    await activity.end(nil, dismissalPolicy: .immediate)
                    NSLog("[ActivityKit] Ended Live Activity for Order: %@", orderId)
                }
            }
        }
    }
}
