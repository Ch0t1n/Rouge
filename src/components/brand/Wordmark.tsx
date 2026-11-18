/**
 * Wordmark de Rouge Pass: "ROUGE" hereda color y brillo del contenedor (text-rouge text-glow-rouge)
 * y "PASS" va en blanco, sin brillo. Se usa como hijo de un elemento que ya define tamaño y fuente.
 */
export function Wordmark() {
  return (
    <>
      ROUGE <span className="text-primary [text-shadow:none]">PASS</span>
    </>
  );
}
