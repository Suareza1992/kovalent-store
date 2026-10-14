// Starting templates for the legal / contact pages, seeded once into the `pages` table.
// After that the shop owner edits them in /admin (Pages). They are a starting point, NOT legal
// advice: the business should have them reviewed for the countries it sells to.
//
// Tokens like {business} are filled from Settings → Business details when the page is shown;
// anything still empty appears as a highlighted "pending" marker so it can't be missed.
// Format: blank line = new paragraph, "## " = heading, "- " = bullet, **bold**.

export const PAGE_SLUGS = ['terms', 'privacy', 'returns', 'contact'];

export const LEGAL_TEMPLATES = {
  terms: {
    es: {
      title: 'Términos de venta',
      body: `Última actualización: {updated}

Estos términos rigen las compras en esta tienda, operada por **{business}** ({address}). Al hacer un pedido aceptas estos términos.

## Pedidos y precios
- Todos los precios están en dólares estadounidenses (USD) e incluyen el detalle de envío e impuestos antes de pagar.
- Podemos cancelar un pedido si un producto no está disponible o si hay un error evidente de precio; en ese caso te reembolsamos el monto completo.
- No necesitas una cuenta: tu correo de confirmación es el registro de tu pedido.

## Pagos
Los pagos se procesan en las páginas seguras de nuestros proveedores (Stripe, PayPal, Mercado Pago) o por transferencia (Zelle, ATH Móvil, transferencia bancaria). No almacenamos datos de tarjetas. Los pedidos pagados por transferencia se envían cuando confirmamos el pago.

## Envíos
Los tiempos de entrega son estimados. En envíos internacionales pueden aplicarse impuestos o aranceles de importación, que corren por cuenta del comprador. El riesgo del producto pasa a ti al momento de la entrega.

## Uso de los productos
Sigue siempre las instrucciones de aplicación y prueba primero en un área poco visible. No somos responsables por daños causados por un uso distinto al indicado.

## Devoluciones
Consulta nuestra política de **Envíos y devoluciones**.

## Ley aplicable
Estos términos se rigen por las leyes de [PENDIENTE: jurisdicción].

## Contacto
{email} · {phone}`,
    },
    en: {
      title: 'Terms of Sale',
      body: `Last updated: {updated}

These terms govern purchases from this store, operated by **{business}** ({address}). By placing an order you agree to them.

## Orders and prices
- All prices are in US dollars (USD); shipping and tax are shown before you pay.
- We may cancel an order if a product is unavailable or a price is clearly wrong; you then receive a full refund.
- No account is needed: your confirmation email is your order record.

## Payments
Payments are processed on our providers' secure pages (Stripe, PayPal, Mercado Pago) or by transfer (Zelle, ATH Móvil, bank transfer). We never store card details. Orders paid by transfer ship once we confirm the payment.

## Shipping
Delivery times are estimates. International orders may incur import taxes or duties, paid by the buyer. Risk of loss passes to you on delivery.

## Using the products
Always follow the application instructions and test on an inconspicuous area first. We are not responsible for damage caused by use other than as directed.

## Returns
See our **Shipping & Returns** policy.

## Governing law
These terms are governed by the laws of [PENDING: jurisdiction].

## Contact
{email} · {phone}`,
    },
    pt: {
      title: 'Termos de venda',
      body: `Última atualização: {updated}

Estes termos regem as compras nesta loja, operada por **{business}** ({address}). Ao fazer um pedido, você aceita estes termos.

## Pedidos e preços
- Todos os preços estão em dólares americanos (USD); frete e impostos aparecem antes do pagamento.
- Podemos cancelar um pedido se um produto estiver indisponível ou houver um erro evidente de preço; nesse caso, você recebe o reembolso integral.
- Não é preciso criar conta: o e-mail de confirmação é o registro do seu pedido.

## Pagamentos
Os pagamentos são processados nas páginas seguras dos nossos provedores (Stripe, PayPal, Mercado Pago) ou por transferência (Zelle, ATH Móvil, transferência bancária). Não armazenamos dados de cartão. Pedidos pagos por transferência são enviados após a confirmação do pagamento.

## Envio
Os prazos de entrega são estimados. Envios internacionais podem ter impostos ou taxas de importação, pagos pelo comprador. O risco do produto passa para você na entrega.

## Uso dos produtos
Siga sempre as instruções de aplicação e teste primeiro em uma área pouco visível. Não nos responsabilizamos por danos causados por uso diferente do indicado.

## Devoluções
Consulte nossa política de **Envios e devoluções**.

## Lei aplicável
Estes termos são regidos pelas leis de [PENDENTE: jurisdição].

## Contato
{email} · {phone}`,
    },
  },

  privacy: {
    es: {
      title: 'Política de privacidad',
      body: `Última actualización: {updated}

**{business}** respeta tu privacidad. Esta política explica qué datos recopilamos y cómo los usamos.

## Qué datos recopilamos
- **Al comprar:** nombre, correo, teléfono (opcional), dirección de envío y los productos de tu pedido.
- **Pagos:** los datos de tu tarjeta o cuenta los recibe directamente el proveedor de pago (Stripe, PayPal, Mercado Pago). Nosotros nunca los vemos.
- **En tu navegador:** guardamos tu carrito y tu idioma en el almacenamiento local de tu dispositivo. No usamos cookies de publicidad ni de seguimiento.

## Para qué los usamos
Para procesar y enviar tu pedido, enviarte el recibo y las novedades del envío, y atender tus preguntas. No vendemos tus datos.

## Con quién los compartimos
Solo con quienes necesitamos para completar tu pedido: proveedores de pago, empresas de envío, nuestro servicio de correo electrónico y nuestro proveedor de hosting.

## Cuánto tiempo los guardamos
Conservamos los registros de pedidos el tiempo que exigen las leyes fiscales y contables.

## Tus derechos
Puedes pedir acceso, corrección o eliminación de tus datos (sujeto a las obligaciones legales de conservar registros) escribiendo a {email}.

## Contacto
{business} · {address} · {email}`,
    },
    en: {
      title: 'Privacy Policy',
      body: `Last updated: {updated}

**{business}** respects your privacy. This policy explains what data we collect and how we use it.

## What we collect
- **When you buy:** name, email, phone (optional), shipping address and the items in your order.
- **Payments:** your card or account details go directly to the payment provider (Stripe, PayPal, Mercado Pago). We never see them.
- **In your browser:** your cart and language are saved in your device's local storage. We use no advertising or tracking cookies.

## How we use it
To process and ship your order, send your receipt and shipping updates, and answer your questions. We do not sell your data.

## Who we share it with
Only those needed to complete your order: payment providers, shipping carriers, our email service and our hosting provider.

## How long we keep it
We keep order records for as long as tax and accounting laws require.

## Your rights
You can ask to access, correct or delete your data (subject to legal record-keeping duties) by writing to {email}.

## Contact
{business} · {address} · {email}`,
    },
    pt: {
      title: 'Política de privacidade',
      body: `Última atualização: {updated}

**{business}** respeita sua privacidade. Esta política explica quais dados coletamos e como os usamos.

## O que coletamos
- **Na compra:** nome, e-mail, telefone (opcional), endereço de entrega e os itens do pedido.
- **Pagamentos:** os dados do cartão ou da conta vão diretamente para o provedor de pagamento (Stripe, PayPal, Mercado Pago). Nunca os vemos.
- **No seu navegador:** seu carrinho e seu idioma ficam salvos no armazenamento local do dispositivo. Não usamos cookies de publicidade ou rastreamento.

## Como usamos
Para processar e enviar seu pedido, mandar o recibo e as atualizações de envio e responder suas dúvidas. Não vendemos seus dados.

## Com quem compartilhamos
Somente com quem é necessário para concluir o pedido: provedores de pagamento, transportadoras, nosso serviço de e-mail e nosso provedor de hospedagem.

## Por quanto tempo guardamos
Mantemos os registros de pedidos pelo tempo exigido pelas leis fiscais e contábeis.

## Seus direitos
Você pode solicitar acesso, correção ou exclusão dos seus dados (sujeito às obrigações legais de guarda de registros) escrevendo para {email}. Para clientes no Brasil, isso inclui os direitos previstos na LGPD.

## Contato
{business} · {address} · {email}`,
    },
  },

  returns: {
    es: {
      title: 'Envíos y devoluciones',
      body: `Última actualización: {updated}

## Envíos
- Los pedidos pagados antes de las 2 PM (ET) salen normalmente el mismo día hábil.
- Entrega estándar en EE. UU. y Puerto Rico: 2–5 días hábiles. Internacional: 7–14 días hábiles.
- Los pedidos pagados por transferencia se envían cuando confirmamos el pago.

## Garantía de 30 días
Si una fórmula no rinde como se describe, abierta o no, escríbenos dentro de los 30 días posteriores a la entrega y te ofrecemos un reembolso o reemplazo.

## Cómo pedir una devolución
1. Escribe a {email} con tu número de pedido y una foto del producto.
2. Te enviamos las instrucciones de devolución.
3. El reembolso se hace al mismo método de pago, normalmente en 5–10 días hábiles después de recibir el producto.

## Productos dañados
Si algo llega dañado, envíanos una foto dentro de 7 días y lo reemplazamos sin necesidad de devolverlo.

## Costos
[PENDIENTE: quién paga el envío de devolución]. Los aranceles de importación internacionales no son reembolsables.`,
    },
    en: {
      title: 'Shipping & Returns',
      body: `Last updated: {updated}

## Shipping
- Orders paid before 2 PM (ET) usually ship the same business day.
- Standard delivery in the US and Puerto Rico: 2–5 business days. International: 7–14 business days.
- Orders paid by transfer ship once we confirm the payment.

## 30-day guarantee
If a formula doesn't perform as described, opened or not, write to us within 30 days of delivery for a refund or replacement.

## How to request a return
1. Email {email} with your order number and a photo of the product.
2. We'll send you return instructions.
3. Refunds go back to the original payment method, usually within 5–10 business days after we receive the item.

## Damaged items
If something arrives damaged, send us a photo within 7 days and we'll replace it; no need to send it back.

## Costs
[PENDING: who pays return shipping]. International import duties are non-refundable.`,
    },
    pt: {
      title: 'Envios e devoluções',
      body: `Última atualização: {updated}

## Envios
- Pedidos pagos antes das 14h (ET) normalmente saem no mesmo dia útil.
- Entrega padrão nos EUA e Porto Rico: 2–5 dias úteis. Internacional: 7–14 dias úteis.
- Pedidos pagos por transferência são enviados após a confirmação do pagamento.

## Garantia de 30 dias
Se uma fórmula não render como descrito, aberta ou não, escreva para nós em até 30 dias após a entrega para reembolso ou troca.

## Como solicitar uma devolução
1. Envie um e-mail para {email} com o número do pedido e uma foto do produto.
2. Enviaremos as instruções de devolução.
3. O reembolso volta para a forma de pagamento original, normalmente em 5–10 dias úteis após recebermos o produto.

## Produtos danificados
Se algo chegar danificado, envie uma foto em até 7 dias e faremos a troca, sem precisar devolver.

## Custos
[PENDENTE: quem paga o frete da devolução]. Taxas de importação internacionais não são reembolsáveis.`,
    },
  },

  contact: {
    es: {
      title: 'Contacto',
      body: `¿Tienes preguntas sobre un producto o un pedido? Escríbenos y te respondemos lo antes posible.

## Correo
{email}

## Teléfono / WhatsApp
{phone}

## Dirección
{address}

## Horario
[PENDIENTE: horario de atención]

Si es sobre un pedido, incluye tu número de pedido (por ejemplo, KV-123456).`,
    },
    en: {
      title: 'Contact',
      body: `Questions about a product or an order? Write to us and we'll get back to you as soon as we can.

## Email
{email}

## Phone / WhatsApp
{phone}

## Address
{address}

## Hours
[PENDING: support hours]

If it's about an order, include your order number (for example, KV-123456).`,
    },
    pt: {
      title: 'Contato',
      body: `Dúvidas sobre um produto ou pedido? Escreva para nós e responderemos o quanto antes.

## E-mail
{email}

## Telefone / WhatsApp
{phone}

## Endereço
{address}

## Horário
[PENDENTE: horário de atendimento]

Se for sobre um pedido, inclua o número do pedido (por exemplo, KV-123456).`,
    },
  },
};
