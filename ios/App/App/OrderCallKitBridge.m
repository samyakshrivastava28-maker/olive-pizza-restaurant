#import "OrderCallKitBridge.h"
#if __has_include("App-Swift.h")
#import "App-Swift.h"
#endif

@implementation OrderCallKitBridge

+ (instancetype)sharedInstance {
    static OrderCallKitBridge *instance = nil;
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{
        instance = [[self alloc] init];
    });
    return instance;
}

- (void)reportIncomingOrder:(NSString *)orderId
                orderNumber:(NSString *)orderNumber
               customerName:(NSString *)customerName
                totalAmount:(NSString *)totalAmount {
    Class swiftCallKit = NSClassFromString(@"App.OrderCallKitService");
    if (!swiftCallKit) {
        swiftCallKit = NSClassFromString(@"OrderCallKitService");
    }
    if (swiftCallKit) {
        id sharedService = [swiftCallKit valueForKey:@"shared"];
        SEL selector = NSSelectorFromString(@"reportIncomingOrderWithOrderId:orderNumber:customerName:totalAmount:");
        if ([sharedService respondsToSelector:selector]) {
            NSMethodSignature *sig = [sharedService methodSignatureForSelector:selector];
            NSInvocation *inv = [NSInvocation invocationWithMethodSignature:sig];
            [inv setTarget:sharedService];
            [inv setSelector:selector];
            [inv setArgument:&orderId atIndex:2];
            [inv setArgument:&orderNumber atIndex:3];
            [inv setArgument:&customerName atIndex:4];
            [inv setArgument:&totalAmount atIndex:5];
            [inv invoke];
        }
    }
}

- (void)endIncomingOrder:(NSString *)orderId {
    Class swiftCallKit = NSClassFromString(@"App.OrderCallKitService");
    if (!swiftCallKit) {
        swiftCallKit = NSClassFromString(@"OrderCallKitService");
    }
    if (swiftCallKit) {
        id sharedService = [swiftCallKit valueForKey:@"shared"];
        SEL selector = NSSelectorFromString(@"endIncomingOrderWithOrderId:");
        if ([sharedService respondsToSelector:selector]) {
            NSMethodSignature *sig = [sharedService methodSignatureForSelector:selector];
            NSInvocation *inv = [NSInvocation invocationWithMethodSignature:sig];
            [inv setTarget:sharedService];
            [inv setSelector:selector];
            [inv setArgument:&orderId atIndex:2];
            [inv invoke];
        }
    }
}

- (void)startLiveActivity:(NSString *)orderId
              orderNumber:(NSString *)orderNumber
              totalAmount:(NSString *)totalAmount
                   status:(NSString *)status
               etaMinutes:(NSInteger)etaMinutes
                     step:(NSInteger)step {
    Class swiftActivityKit = NSClassFromString(@"App.OrderActivityKitService");
    if (!swiftActivityKit) {
        swiftActivityKit = NSClassFromString(@"OrderActivityKitService");
    }
    if (swiftActivityKit) {
        id sharedService = [swiftActivityKit valueForKey:@"shared"];
        SEL selector = NSSelectorFromString(@"startOrderActivityWithOrderId:orderNumber:totalAmount:status:etaMinutes:step:");
        if ([sharedService respondsToSelector:selector]) {
            NSMethodSignature *sig = [sharedService methodSignatureForSelector:selector];
            NSInvocation *inv = [NSInvocation invocationWithMethodSignature:sig];
            [inv setTarget:sharedService];
            [inv setSelector:selector];
            [inv setArgument:&orderId atIndex:2];
            [inv setArgument:&orderNumber atIndex:3];
            [inv setArgument:&totalAmount atIndex:4];
            [inv setArgument:&status atIndex:5];
            [inv setArgument:&etaMinutes atIndex:6];
            [inv setArgument:&step atIndex:7];
            [inv invoke];
        }
    }
}

- (void)updateLiveActivity:(NSString *)orderId
                    status:(NSString *)status
                etaMinutes:(NSInteger)etaMinutes
                      step:(NSInteger)step {
    Class swiftActivityKit = NSClassFromString(@"App.OrderActivityKitService");
    if (!swiftActivityKit) {
        swiftActivityKit = NSClassFromString(@"OrderActivityKitService");
    }
    if (swiftActivityKit) {
        id sharedService = [swiftActivityKit valueForKey:@"shared"];
        SEL selector = NSSelectorFromString(@"updateOrderActivityWithOrderId:status:etaMinutes:step:");
        if ([sharedService respondsToSelector:selector]) {
            NSMethodSignature *sig = [sharedService methodSignatureForSelector:selector];
            NSInvocation *inv = [NSInvocation invocationWithMethodSignature:sig];
            [inv setTarget:sharedService];
            [inv setSelector:selector];
            [inv setArgument:&orderId atIndex:2];
            [inv setArgument:&status atIndex:3];
            [inv setArgument:&etaMinutes atIndex:4];
            [inv setArgument:&step atIndex:5];
            [inv invoke];
        }
    }
}

- (void)endLiveActivity:(NSString *)orderId {
    Class swiftActivityKit = NSClassFromString(@"App.OrderActivityKitService");
    if (!swiftActivityKit) {
        swiftActivityKit = NSClassFromString(@"OrderActivityKitService");
    }
    if (swiftActivityKit) {
        id sharedService = [swiftActivityKit valueForKey:@"shared"];
        SEL selector = NSSelectorFromString(@"endOrderActivityWithOrderId:");
        if ([sharedService respondsToSelector:selector]) {
            NSMethodSignature *sig = [sharedService methodSignatureForSelector:selector];
            NSInvocation *inv = [NSInvocation invocationWithMethodSignature:sig];
            [inv setTarget:sharedService];
            [inv setSelector:selector];
            [inv setArgument:&orderId atIndex:2];
            [inv invoke];
        }
    }
}

@end
