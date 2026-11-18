#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

/**
 * OrderCallKitBridge — Objective-C Interface for CallKit and ActivityKit
 * Provides seamless bridge between Capacitor, Native Objective-C runtime, and Swift services.
 */
@interface OrderCallKitBridge : NSObject

+ (instancetype)sharedInstance;

- (void)reportIncomingOrder:(NSString *)orderId
                orderNumber:(NSString *)orderNumber
               customerName:(NSString *)customerName
                totalAmount:(NSString *)totalAmount;

- (void)endIncomingOrder:(NSString *)orderId;

- (void)startLiveActivity:(NSString *)orderId
              orderNumber:(NSString *)orderNumber
              totalAmount:(NSString *)totalAmount
                   status:(NSString *)status
               etaMinutes:(NSInteger)etaMinutes
                     step:(NSInteger)step;

- (void)updateLiveActivity:(NSString *)orderId
                    status:(NSString *)status
                etaMinutes:(NSInteger)etaMinutes
                      step:(NSInteger)step;

- (void)endLiveActivity:(NSString *)orderId;

@end

NS_ASSUME_NONNULL_END
