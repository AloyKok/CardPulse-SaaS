import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

const variants: Record<Variant, string> = {
  primary: 'bg-ink text-white shadow-soft hover:bg-slate-800 active:translate-y-px',
  secondary: 'border border-line bg-white text-ink shadow-[0_1px_0_rgba(15,23,42,0.04)] hover:border-slate-300 hover:bg-slate-50 active:translate-y-px',
  danger: 'bg-danger text-white shadow-soft hover:bg-red-800 active:translate-y-px',
  ghost: 'bg-transparent text-slate-700 hover:bg-slate-100 active:translate-y-px'
};

export function Button({ className = '', variant = 'primary', type = 'button', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type={type}
      {...props}
      className={`min-h-11 min-w-0 rounded-lg px-4 py-2 text-sm font-black transition disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`}
    />
  );
}
