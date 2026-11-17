import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/LegalPage";

export const metadata: Metadata = { title: "Política de privacidad · ROUGE" };

export default function PrivacyPolicyPage() {
  return (
    <LegalPage title="Política de privacidad" updated="17 de noviembre de 2026">
      <p>Cumplimos la Ley 25.326 de Protección de Datos Personales. Solo pedimos lo necesario para que la noche funcione y nunca vendemos tus datos.</p>
      <h2>Qué datos usamos</h2>
      <ul>
        <li><b>Perfil público:</b> nombre, @usuario, edad (no tu fecha), fotos, bio, géneros musicales e Instagram si lo agregás.</li>
        <li><b>Teléfono:</b> nunca se muestra a otros asistentes. Se usa para que los bloqueos por número funcionen y lo ve solo el organizador del evento al que entraste (CRM).</li>
        <li><b>Ubicación en el plano:</b> solo cuando dejás un pin, solo para las personas que elegís y por 15 minutos. No guardamos coordenadas de tu historial: solo los sectores del plano.</li>
        <li><b>Fotos:</b> se recomprimen en tu teléfono antes de subirlas; ese proceso elimina los metadatos EXIF (incluida la ubicación GPS).</li>
        <li><b>Pagos:</b> los procesa Mercado Pago; ROUGE no ve ni guarda datos de tarjetas. Los tokens de terceros (Mercado Pago, Instagram) se guardan cifrados (AES-256-GCM).</li>
      </ul>
      <h2>Visibilidad</h2>
      <p>Si el evento lo exige, solo aparecés en la grilla después de ingresar por la puerta. Podés ocultarte con el Modo Solo Amigos. El lobby se apaga al terminar el evento; tus matches y chats quedan solo para vos y la otra persona.</p>
      <h2>Tus derechos</h2>
      <p>Podés acceder, rectificar y suprimir tus datos. El borrado de cuenta desde Privacidad es real y definitivo (los pedidos ya pagados quedan anonimizados para la contabilidad del local). La Agencia de Acceso a la Información Pública es el órgano de control de la Ley 25.326.</p>
    </LegalPage>
  );
}
