import * as React from "react";

import { cn } from "@/lib/utils";

type TooltipSide = "top" | "right" | "bottom" | "left";

type TooltipContextValue = {
  open: boolean;
  show: () => void;
  hide: () => void;
};

const TooltipContext = React.createContext<TooltipContextValue | null>(null);

const useTooltipContext = () => {
  const context = React.useContext(TooltipContext);

  if (!context) {
    throw new Error("Tooltip components must be used within <Tooltip>.");
  }

  return context;
};

const setRef = <T,>(ref: React.Ref<T> | undefined, value: T) => {
  if (!ref) return;
  if (typeof ref === "function") {
    ref(value);
    return;
  }
  (ref as React.MutableRefObject<T>).current = value;
};

const mergeRefs = <T,>(...refs: Array<React.Ref<T> | undefined>) => (value: T) => {
  refs.forEach((ref) => setRef(ref, value));
};

const callAll = <E,>(...handlers: Array<((event: E) => void) | undefined>) => (event: E) => {
  handlers.forEach((handler) => handler?.(event));
};

const TooltipProvider = ({ children }: { children: React.ReactNode; delayDuration?: number }) => <>{children}</>;

const Tooltip = ({
  children,
  delayDuration = 0,
}: {
  children: React.ReactNode;
  delayDuration?: number;
}) => {
  const [open, setOpen] = React.useState(false);
  const timeoutRef = React.useRef<number | null>(null);

  const clearTimer = React.useCallback(() => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const show = React.useCallback(() => {
    clearTimer();

    if (delayDuration > 0) {
      timeoutRef.current = window.setTimeout(() => setOpen(true), delayDuration);
      return;
    }

    setOpen(true);
  }, [clearTimer, delayDuration]);

  const hide = React.useCallback(() => {
    clearTimer();
    setOpen(false);
  }, [clearTimer]);

  React.useEffect(() => clearTimer, [clearTimer]);

  const value = React.useMemo(
    () => ({ open, show, hide }),
    [open, show, hide],
  );

  return (
    <TooltipContext.Provider value={value}>
      <div className="relative inline-flex w-full">{children}</div>
    </TooltipContext.Provider>
  );
};

const TooltipTrigger = React.forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement> & { asChild?: boolean }>(
  ({ asChild = false, children, className, onMouseEnter, onMouseLeave, onFocus, onBlur, ...props }, ref) => {
    const { show, hide } = useTooltipContext();

    const triggerProps = {
      ...props,
      className,
      onMouseEnter: callAll(onMouseEnter, () => show()),
      onMouseLeave: callAll(onMouseLeave, () => hide()),
      onFocus: callAll(onFocus, () => show()),
      onBlur: callAll(onBlur, () => hide()),
    };

    if (asChild && React.isValidElement(children)) {
      const child = children as React.ReactElement<any>;

      return React.cloneElement(child, {
        ...triggerProps,
        ...child.props,
        className: cn(className, child.props.className),
        onMouseEnter: callAll(child.props.onMouseEnter, onMouseEnter, () => show()),
        onMouseLeave: callAll(child.props.onMouseLeave, onMouseLeave, () => hide()),
        onFocus: callAll(child.props.onFocus, onFocus, () => show()),
        onBlur: callAll(child.props.onBlur, onBlur, () => hide()),
        ref: mergeRefs((child as any).ref, ref),
      });
    }

    return (
      <button ref={ref as React.Ref<HTMLButtonElement>} type="button" {...triggerProps}>
        {children}
      </button>
    );
  },
);
TooltipTrigger.displayName = "TooltipTrigger";

const sideClasses: Record<TooltipSide, string> = {
  top: "bottom-full left-1/2 -translate-x-1/2",
  right: "left-full top-1/2 -translate-y-1/2",
  bottom: "top-full left-1/2 -translate-x-1/2",
  left: "right-full top-1/2 -translate-y-1/2",
};

const sideOffsets = (side: TooltipSide, amount: number): React.CSSProperties => {
  switch (side) {
    case "top":
      return { marginBottom: amount };
    case "right":
      return { marginLeft: amount };
    case "bottom":
      return { marginTop: amount };
    case "left":
      return { marginRight: amount };
    default:
      return {};
  }
};

const TooltipContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    side?: TooltipSide;
    sideOffset?: number;
    align?: "start" | "center" | "end";
  }
>(({ className, side = "top", sideOffset = 4, hidden, style, children, ...props }, ref) => {
  const { open } = useTooltipContext();

  if (!open || hidden) {
    return null;
  }

  return (
    <div
      ref={ref}
      role="tooltip"
      className={cn(
        "pointer-events-none absolute z-50 overflow-hidden rounded-md border bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-md",
        sideClasses[side],
        className,
      )}
      style={{
        ...sideOffsets(side, sideOffset),
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  );
});
TooltipContent.displayName = "TooltipContent";

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
