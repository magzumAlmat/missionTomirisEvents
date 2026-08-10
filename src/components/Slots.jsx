/** Ряд ячеек с собранными буквами + счётчик. */
export default function Slots({ letters, solvedCount, total }) {
  return (
    <>
      <div className="progress">
        {letters.map((ltr, i) => (
          <div key={i} className={"slot" + (ltr ? " filled" : "")}>
            {ltr || "·"}
          </div>
        ))}
      </div>
      <div className="count">
        Собрано {solvedCount} из {total}
      </div>
    </>
  );
}
