import type { DetailedHTMLProps, HTMLAttributes } from "react";

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "aurum-video-player": DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
        src?: string;
        poster?: string;
        title?: string;
        autoplay?: boolean;
        muted?: boolean;
        preload?: "none" | "metadata" | "auto";
      };
    }
  }
}
