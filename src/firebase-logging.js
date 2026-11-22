// Public Firebase API only; does not alter SDK files or security settings.
export function reduceFirebaseLogging(appModule) {
  appModule.setLogLevel('silent');
}
