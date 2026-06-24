import { useEffect, useId, useRef, useState } from 'react';
import type { InputHTMLAttributes, KeyboardEvent, ReactNode, TextareaHTMLAttributes } from 'react';
import { Check, ChevronDown } from 'lucide-react';

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid min-w-0 gap-1.5 text-sm font-bold text-slate-700">
      <span className="text-xs font-black uppercase tracking-wide text-slate-500">{label}</span>
      {children}
    </label>
  );
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      onWheel={(event) => {
        props.onWheel?.(event);
        if (props.type === 'number' && !event.defaultPrevented) {
          event.currentTarget.blur();
        }
      }}
      className={`min-h-11 w-full min-w-0 max-w-full rounded-lg border border-line bg-white px-3 text-base font-semibold text-ink outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-ink focus:ring-4 focus:ring-slate-900/10 ${props.className || ''}`}
    />
  );
}

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
  muted?: boolean;
}

interface SelectInputProps {
  value: string;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function SelectInput({
  value,
  onValueChange,
  options,
  placeholder = 'Select an option',
  disabled = false,
  className = ''
}: SelectInputProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const selected = options.find((option) => option.value === value);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(event.key)) {
      event.preventDefault();
      setOpen(true);
    }
  };

  return (
    <div ref={rootRef} className={`relative min-w-0 ${className}`}>
      <button
        type="button"
        role="combobox"
        aria-controls={listboxId}
        aria-expanded={open}
        aria-haspopup="listbox"
        disabled={disabled}
        className="flex min-h-11 w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-line bg-white px-3 text-left text-base font-bold text-ink outline-none transition hover:border-slate-300 focus:border-ink focus:ring-4 focus:ring-slate-900/10 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
        onClick={() => setOpen((current) => !current)}
        onKeyDown={handleKeyDown}
      >
        <span className={`min-w-0 flex-1 truncate ${selected ? selected.muted ? 'text-slate-500' : '' : 'text-slate-500'}`}>
          {selected?.label || placeholder}
        </span>
        <ChevronDown className={`shrink-0 text-slate-500 transition ${open ? 'rotate-180' : ''}`} size={18} />
      </button>
      {open && (
        <div
          id={listboxId}
          role="listbox"
          className="absolute inset-x-0 top-[calc(100%+0.35rem)] z-50 max-h-72 min-w-0 overflow-y-auto overscroll-contain rounded-xl border border-line bg-white p-1.5 shadow-soft"
          onKeyDown={(event) => {
            if (event.key === 'Escape') setOpen(false);
          }}
        >
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={option.value === value}
              disabled={option.disabled}
              className={`flex min-h-11 w-full min-w-0 items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-bold hover:bg-slate-100 disabled:opacity-40 ${option.muted ? 'bg-slate-50 text-slate-400' : 'text-slate-700'}`}
              onClick={() => {
                onValueChange(option.value);
                setOpen(false);
              }}
            >
              <span className="min-w-0 flex-1 break-words">{option.label}</span>
              {option.value === value && <Check className="shrink-0 text-action" size={17} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`min-h-24 w-full min-w-0 max-w-full resize-y rounded-lg border border-line bg-white p-3 text-base font-semibold outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-ink focus:ring-4 focus:ring-slate-900/10 ${props.className || ''}`} />;
}
