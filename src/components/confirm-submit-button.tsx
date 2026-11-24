"use client";

import type { ButtonHTMLAttributes, MouseEvent } from "react";

export function ConfirmSubmitButton({
  confirmation,
  onClick,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { confirmation: string }) {
  return (
    <button
      {...props}
      onClick={(event: MouseEvent<HTMLButtonElement>) => {
        onClick?.(event);
        if (!event.defaultPrevented && !window.confirm(confirmation)) {
          event.preventDefault();
        }
      }}
    />
  );
}
