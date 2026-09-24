import { Link } from "react-router";
import { AuthLayout } from "../components/AuthLayout";

export function NotFoundPage() {
  return (
    <AuthLayout title="Page not found">
      <p>We couldn't find that page.</p>
      <Link to="/">Go home</Link>
    </AuthLayout>
  );
}
