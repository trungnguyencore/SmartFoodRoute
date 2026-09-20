import { BrowserRouter, HashRouter } from "react-router-dom";
import { envResult } from "./lib/env";
import { Providers } from "./app/providers";
import { AppRoutes } from "./app/router";

export function App() {
  if (!envResult.success) {
    return (
      <main className="setup card">
        <p className="eyebrow">SmartFoodRoute</p>
        <h1>Thiết lập kết nối</h1>
        <p>Ứng dụng cần cấu hình Supabase để đăng nhập an toàn.</p>
        <p>
          Sao chép <code>.env.example</code> thành <code>.env.local</code>, điền
          cấu hình và khởi động lại.
        </p>
        <ul>
          {envResult.error.issues.map((issue, i) => (
            <li key={i}>{issue.path.join(".")}</li>
          ))}
        </ul>
        <p>Chỉ dùng public/anon key. Hướng dẫn chi tiết nằm trong README.md.</p>
      </main>
    );
  }
  const Router =
    envResult.data.VITE_DEPLOY_TARGET === "pages" ? HashRouter : BrowserRouter;
  return (
    <Providers>
      <Router
        basename={
          Router === BrowserRouter ? envResult.data.VITE_BASE_PATH : undefined
        }
      >
        <AppRoutes />
      </Router>
    </Providers>
  );
}
