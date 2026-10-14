# Afiliados Passo a Passo IA — landing + app (beta)

Site estático (HTML, CSS e JS puros). Sem build, sem servidor, sem custo. Funciona no GitHub Pages.

## O que funciona hoje (tudo no navegador)
- **Editar vídeo:** escolher vídeo, plataforma, proporção (9:16, 1:1, 16:9), enquadramento sem deformar, estilo (Original, Dinâmico, Legendado), prévia e download. Gravado em tempo real, então leva a duração do vídeo. Melhor no Chrome.
- **Criar do zero sem rosto:** roteiro por modelos prontos (**não usa IA**).
- **Histórico:** roteiros, vídeos e mensagens salvos só no aparelho (localStorage e IndexedDB).
- **Suporte:** o envio só acontece se `SUPPORT_ENDPOINT` estiver configurado; sem isso, a mensagem fica salva no aparelho e o aviso diz isso.

## O que NÃO existe ainda
Contas, IA, legenda automática, narração, pagamentos e envio de suporte.

## Arquivos
`index.html` (landing), `app.html` + `app.js` + `app.css` (app), `contato`, `privacidade`, `termos`, `styles.css`, `config.js`, `main.js`, logos SVG.

## Configurar (`config.js`)
`WAITLIST_FORM_URL` (Google Forms), `WHATSAPP_NUMBER`, `SUPPORT_ENDPOINT` (ex.: um endpoint de Formspree). Valores ali são públicos: **nunca coloque senhas ou chaves secretas**.

## `.env.example`
O navegador não lê `.env`. O arquivo só documenta as variáveis para uma futura migração (ex.: Next.js). Segredos ficam só no servidor.

## Pixel do Facebook
Há um espaço marcado `PIXEL_FACEBOOK_AQUI` no `<head>` de todas as páginas, desativado. Antes de colar o código, atualize `privacidade.html` e peça consentimento (LGPD).

## Rodar local
`python3 -m http.server 8000` e abra http://localhost:8000

## Publicar
GitHub Pages: suba os arquivos na raiz do repositório e ative em Settings → Pages.
