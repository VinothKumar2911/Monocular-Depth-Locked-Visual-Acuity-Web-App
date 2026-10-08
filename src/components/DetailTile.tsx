type DetailTileProps = {
  eyebrow: string;
  title: string;
  detail: string;
};

export default function DetailTile({ eyebrow, title, detail }: DetailTileProps) {
  return (
    <article className="detail-tile">
      <div className="detail-mark" aria-hidden="true" />
      <div>
        <div className="stat-label">{eyebrow}</div>
        <h3>{title}</h3>
        <p>{detail}</p>
      </div>
    </article>
  );
}
