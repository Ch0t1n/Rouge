import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/LegalPage";

export const metadata: Metadata = { title: "Términos y condiciones · ROUGE" };

export default function TermsPage() {
  return (
    <LegalPage title="Términos y condiciones" updated="17 de noviembre de 2026">
      <p>ROUGE es una plataforma que conecta a las personas que asisten a un evento con el evento y entre sí. Al crear tu cuenta aceptás estos términos.</p>
      <h2>1. Edad mínima</h2>
      <p>ROUGE es exclusivamente para mayores de 18 años. Al registrarte declarás tener 18 años o más; verificamos tu fecha de nacimiento y la puerta del evento puede pedirte documento. Las cuentas de menores se eliminan.</p>
      <h2>2. Tu cuenta</h2>
      <ul>
        <li>Sos responsable de la información de tu perfil y de mantener tu acceso seguro.</li>
        <li>Tu @usuario es único; no podés suplantar a otra persona.</li>
        <li>Podés borrar tu cuenta en cualquier momento desde Privacidad: el borrado es real y definitivo.</li>
      </ul>
      <h2>3. Convivencia</h2>
      <p>No se permite el acoso, la violencia, el contenido sexual no consentido, la discriminación ni el spam. Cualquier persona puede bloquear (invisibilidad mutua) y reportar; el equipo de seguridad del evento recibe los reportes en vivo y el organizador puede expulsar a quien incumpla.</p>
      <h2>4. Compras en la barra</h2>
      <p>Los pedidos de la Barra Express los vende el organizador del evento, que es el responsable del producto y de su entrega. Los pagos online se procesan con Mercado Pago en la cuenta del organizador. El ticket de comanda es un comprobante interno, no una factura. Podés ejercer tu derecho de revocación con el <a href="/legal/arrepentimiento" className="text-rouge underline">Botón de arrepentimiento</a>.</p>
      <h2>5. Consumo responsable</h2>
      <p>Prohibida la venta de alcohol a menores de 18 años. Si bebés, no manejes.</p>
      <h2>6. Cambios</h2>
      <p>Si cambiamos estos términos te avisamos en la app antes de que entren en vigencia.</p>
    </LegalPage>
  );
}
