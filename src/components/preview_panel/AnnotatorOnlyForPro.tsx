interface AnnotatorOnlyForProProps {
  onGoBack: () => void;
}

/**
 * Override: Annotator is now unlocked for all users.
 * Instead of showing a "Pro required" gate, we render nothing
 * and let the annotator component render directly.
 */
export const AnnotatorOnlyForPro = ({ onGoBack }: AnnotatorOnlyForProProps) => {
  // Pro override: annotator is always unlocked, return null so the parent
  // renders the actual annotator directly.
  return null;
};
