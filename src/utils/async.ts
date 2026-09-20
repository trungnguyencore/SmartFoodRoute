export function withTimeout<T>(
  work: Promise<T>,
  milliseconds = 15000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Kết nối quá thời gian chờ. Vui lòng thử lại.")),
      milliseconds,
    );
    work.then(
      (result) => {
        clearTimeout(timer);
        resolve(result);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
