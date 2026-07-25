// این تابع هر async controller را wrap می‌کند تا هر خطایی که در آن رخ دهد
// خودکار به app.use((err, req, res, next) => ...) در app.js فرستاده شود،
// بدون نیاز به نوشتن try/catch در تک‌تک controllerها
module.exports = (fn) => {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
};
