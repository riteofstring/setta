const twoDecimalsFormat = new Intl.NumberFormat("en", {
  notation: "standard",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function getTooltipText(tooltipData) {
  return tooltipData.map((d, i) => (
    <div key={i}>
      {`${d.name}: ${twoDecimalsFormat.format(d.data.y)}`}
      <br />
    </div>
  ));
}
