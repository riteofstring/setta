export function ThumbnailLogo({ styles, svgStyles }) {
  return (
    <div className={styles}>
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
        <path
          className={svgStyles}
          d="m90.77,1.11l-24.12,24.28h-21.49c-6.4,0-11.48,5.25-11.48,11.65v61.85l-24.44-24.44V25.39c0-6.56,2.79-12.63,7.22-17.06C20.88,3.9,26.95,1.11,33.68,1.11h57.09Z"
        />
      </svg>
    </div>
  );
}
