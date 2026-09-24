// Which navigation chrome the dashboard shows. Phone chrome (pinned top bar,
// tab bar, sidebar as a sheet) on narrow screens, and also on touch screens
// too short for the desktop layout: a phone in landscape is 812-932px wide
// but only 375-430px tall, and the desktop rail plus docked chat left it
// sub-44px targets under the notch.
//
// Tablets (touch, 744px+ tall) and every mouse-driven screen keep the desktop
// layout. PHONE_MEDIA and DESK_MEDIA are exact complements; they back
// useIsMobile and the phone:/desk: Tailwind variants (tailwind.config.ts),
// and index.css repeats PHONE_MEDIA for the 16px input rule.
export const PHONE_MEDIA = "(max-width: 767.98px), (pointer: coarse) and (max-height: 499.98px)";

export const DESK_MEDIA =
  "(min-width: 768px) and (pointer: fine), (min-width: 768px) and (pointer: none), (min-width: 768px) and (min-height: 500px)";
