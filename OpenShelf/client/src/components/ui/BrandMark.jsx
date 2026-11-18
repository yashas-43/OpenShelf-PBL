import { BookOpen, Sparkles } from "lucide-react";
export default function BrandMark({ compact = false }) {
  return (
    <div className="brand-lockup">
      <div className="brand-icon"><BookOpen size={22} strokeWidth={1.8} /><Sparkles size={10} className="brand-spark" /></div>
      {!compact && <div><div className="brand-name">OpenShelf<span>®</span></div><div className="brand-tagline">DISCOVER. BORROW. READ. GROW.</div></div>}
    </div>
  );
}
