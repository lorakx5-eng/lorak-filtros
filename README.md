# Lorak Filtros — MVP

Filtro mobile para festas, com eventos por URL, foto, vídeo, moldura PNG, download e upload ao Google Drive.

## Evento
Crie `eventos/meu-evento.json` e acesse `/?evento=meu-evento`.

Exemplo:
```json
{"name":"Mavie - 2 anos","frame":"assets/molduras/mavie.png","driveUploadUrl":"URL_DO_WEB_APP","albumUrl":"LINK_DA_PASTA"}
```

## Google Drive
Publique `google-drive/Code.gs` como Web App no Google Apps Script, executando como sua conta e com acesso para qualquer pessoa. Copie a URL para `driveUploadUrl`.

## Limitação da primeira versão
Fotos recebem a moldura no arquivo final. Vídeos são gravados em WebM, mas a moldura ainda não é renderizada dentro do vídeo. Essa é a próxima etapa técnica.
