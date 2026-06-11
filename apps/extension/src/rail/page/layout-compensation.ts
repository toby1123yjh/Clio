interface SavedLayoutStyles {
  bodyPaddingRight: string;
  bodyTransition: string;
  documentOverflowX: string;
}

let savedLayoutStyles: SavedLayoutStyles | null = null;

export function applyPageLayoutCompensation(width: number) {
  if (document.body === null) return;
  if (savedLayoutStyles === null) {
    savedLayoutStyles = {
      bodyPaddingRight: document.body.style.paddingRight,
      bodyTransition: document.body.style.transition,
      documentOverflowX: document.documentElement.style.overflowX,
    };
  }
  document.body.style.paddingRight = `${Math.max(0, Math.round(width))}px`;
  document.body.style.transition = "padding-right 160ms ease-out";
  document.documentElement.style.overflowX = "hidden";
}

export function restorePageLayoutCompensation() {
  if (document.body === null || savedLayoutStyles === null) return;
  document.body.style.paddingRight = savedLayoutStyles.bodyPaddingRight;
  document.body.style.transition = savedLayoutStyles.bodyTransition;
  document.documentElement.style.overflowX = savedLayoutStyles.documentOverflowX;
  savedLayoutStyles = null;
}
