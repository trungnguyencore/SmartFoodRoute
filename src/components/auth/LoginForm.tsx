import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link } from "react-router-dom";
import { getSupabase } from "../../lib/supabase";
import { appUrl } from "../../lib/env";
const schema = z.object({
  email: z.email("Email không hợp lệ"),
  password: z.string().min(8, "Mật khẩu tối thiểu 8 ký tự"),
});
export function LoginForm({ signup = false }: { signup?: boolean }) {
  const [message, setMessage] = useState("");
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });
  return (
    <form
      onSubmit={handleSubmit(async (values) => {
        setMessage("");
        try {
          const response = signup
            ? await getSupabase().auth.signUp({
                ...values,
                options: { emailRedirectTo: appUrl("/auth/callback") },
              })
            : await getSupabase().auth.signInWithPassword(values);
          if (response.error)
            setMessage(
              signup
                ? "Chưa thể tạo tài khoản. Kiểm tra thông tin và thử lại."
                : "Đăng nhập thất bại. Kiểm tra email, mật khẩu và xác nhận email.",
            );
          else if (signup && !response.data.session)
            setMessage(
              "Hãy kiểm tra email để xác nhận tài khoản, sau đó đăng nhập.",
            );
        } catch {
          setMessage("Không kết nối được. Hãy thử lại.");
        }
      })}
    >
      <label>
        Email
        <input
          type="email"
          autoComplete="email"
          {...register("email")}
          aria-invalid={!!errors.email}
        />
      </label>
      {errors.email && <p role="alert">{errors.email.message}</p>}
      <label>
        Mật khẩu
        <input
          type="password"
          autoComplete={signup ? "new-password" : "current-password"}
          {...register("password")}
          aria-invalid={!!errors.password}
        />
      </label>
      {errors.password && <p role="alert">{errors.password.message}</p>}
      {message && (
        <p role="status" className="notice">
          {message}
        </p>
      )}
      <button disabled={isSubmitting}>
        {isSubmitting ? "Đang xử lý…" : signup ? "Tạo tài khoản" : "Đăng nhập"}
      </button>
      <div className="row">
        <Link to={signup ? "/login" : "/signup"}>
          {signup ? "Đã có tài khoản" : "Tạo tài khoản mới"}
        </Link>
        <Link to="/forgot-password">Quên mật khẩu?</Link>
      </div>
    </form>
  );
}
