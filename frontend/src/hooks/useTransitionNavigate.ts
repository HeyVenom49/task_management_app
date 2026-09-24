import { useNavigate } from "react-router";
import type { NavigateOptions } from "react-router";

type DocumentWithViewTransitions = Document & {
  startViewTransition?: (callback: () => void) => void;
};

export function useTransitionNavigate() {
  const navigate = useNavigate();

  return (to: string, options?: NavigateOptions) => {
    const doc = document as DocumentWithViewTransitions;
    if (doc.startViewTransition) {
      doc.startViewTransition(() => navigate(to, options));
    } else {
      navigate(to, options);
    }
  };
}
