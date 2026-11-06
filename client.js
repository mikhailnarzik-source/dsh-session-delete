/**
 * Browser half of `dsh-session-delete`.
 *
 * Contributes two things to the page:
 *  - a `Delete session` row in the Session "..." menu
 *    (`sidebar.workspaces.session.menu.item`), and
 *  - a frame-wide confirmation dialog (`shell.overlay`) with three steps:
 *    confirm, review the Sessions linked by lineage, then type `delete` and
 *    optionally remove the project files this Session created.
 *
 * The dialog and its controls copy the host primitives' markup and CSS under a
 * private `dshsd-` prefix, so the look, motion and typography follow the
 * configured DSH theme and font without importing a Client package.
 *
 * The destructive operation itself runs on the Host half behind POSTs on the
 * authenticated `/api` channel.
 */
window.__ModuleLoader__.load({
  id: 'dsh-session-delete',
  factory(require) {
    const React = require('react')
    const { createPortal } = require('react-dom')
    const h = React.createElement

    /** Locale namespace owned by this plugin. */
    const NS = 'sessionDelete'
    /** Host routes registered by index.js. */
    const INSPECT_PATH = '/api/session-delete/inspect'
    const DELETE_PATH = '/api/session-delete/delete'
    /** Word the user must type before the last button enables. */
    const CONFIRM_WORD = 'delete'
    /** Private class prefix; never collides with host class names. */
    const P = 'dshsd'

    const en = {
      'menu.delete': 'Delete session',
      'dialog.title': 'Delete session?',
      'dialog.question': 'Are you sure you want to delete this session?',
      'dialog.detail': 'The conversation history, its projection cache and its workspace entry are removed. Project files on disk are kept unless you choose to delete them in the next step.',
      'dialog.checking': 'Checking linked sessions and files…',
      'dialog.confirmTitle': 'Confirm deletion',
      'dialog.confirmDetail': 'Session "{title}" will be deleted permanently. This action cannot be undone.',
      'dialog.confirmDetailUntitled': 'This session will be deleted permanently. This action cannot be undone.',
      'dialog.typeWord': 'Type {word} in the field below, then press Yes.',
      'dialog.placeholder': 'delete',
      'dialog.deleting': 'Deleting…',
      'dialog.yes': 'Yes',
      'dialog.no': 'No',
      'dialog.close': 'Close',
      'related.title': 'Session is linked to other sessions',
      'related.desc': 'Linked sessions: {count}. Descendant sessions are deleted with this one.',
      'related.note': 'Review the linked sessions before continuing.',
      'related.show': 'Show the list ({count})',
      'related.parent': 'parent session',
      'related.child': 'child session',
      'related.running': 'running',
      'related.untitled': 'Untitled session',
      'files.checkbox': 'Also delete the files this session created ({count})',
      'files.show': 'Show the paths ({count})',
      'files.risk': 'Those project files will be removed from disk. This cannot be undone.',
      'session.liveNote': 'This session is open right now. It will be closed as part of the deletion.',
      'session.runningNote': 'This session is generating a reply. It will be stopped and closed as part of the deletion.',
      'error.active': 'The session could not be closed. Try again.',
      'error.notFound': 'This session no longer exists.',
      'error.invalid': 'The request was rejected.',
      'error.network': 'The request failed. Nothing was deleted.',
      'error.generic': 'Operation failed: {message}',
    }

    const ru = {
      'menu.delete': 'Удалить сессию',
      'dialog.title': 'Удалить сессию?',
      'dialog.question': 'Вы точно хотите удалить данную сессию?',
      'dialog.detail': 'История переписки, кэш проекций и запись в списке workspace будут удалены. Файлы проекта на диске останутся, если не отметить их удаление на следующем шаге.',
      'dialog.checking': 'Проверка связанных сессий и файлов…',
      'dialog.confirmTitle': 'Подтверждение удаления',
      'dialog.confirmDetail': 'Сессия «{title}» будет удалена безвозвратно. Это действие нельзя отменить.',
      'dialog.confirmDetailUntitled': 'Сессия будет удалена безвозвратно. Это действие нельзя отменить.',
      'dialog.typeWord': 'Введите слово {word} в поле ниже и нажмите «Да».',
      'dialog.placeholder': 'delete',
      'dialog.deleting': 'Удаление…',
      'dialog.yes': 'Да',
      'dialog.no': 'Нет',
      'dialog.close': 'Закрыть',
      'related.title': 'Сессия связана с другими',
      'related.desc': 'Связанных сессий: {count}. Дочерние сессии будут удалены вместе с этой.',
      'related.note': 'Проверьте список связанных сессий, прежде чем продолжать.',
      'related.show': 'Показать список ({count})',
      'related.parent': 'родительская сессия',
      'related.child': 'дочерняя сессия',
      'related.running': 'активна',
      'related.untitled': 'Сессия без названия',
      'files.checkbox': 'Также удалить файлы, созданные этой сессией ({count})',
      'files.show': 'Показать пути ({count})',
      'files.risk': 'Эти файлы проекта будут удалены с диска. Восстановить их нельзя.',
      'session.liveNote': 'Сессия открыта прямо сейчас. При удалении она будет закрыта.',
      'session.runningNote': 'Сессия сейчас генерирует ответ. При удалении она будет остановлена и закрыта.',
      'error.active': 'Не удалось закрыть сессию. Попробуйте ещё раз.',
      'error.notFound': 'Сессии уже не существует.',
      'error.invalid': 'Запрос отклонён.',
      'error.network': 'Не удалось выполнить запрос. Ничего не удалено.',
      'error.generic': 'Не удалось выполнить: {message}',
    }

    const de = {
      'menu.delete': 'Sitzung löschen',
      'dialog.title': 'Sitzung löschen?',
      'dialog.question': 'Möchten Sie diese Sitzung wirklich löschen?',
      'dialog.detail': 'Verlauf, Projektions-Cache und Workspace-Eintrag werden entfernt. Projektdateien auf der Festplatte bleiben erhalten, sofern Sie im nächsten Schritt nicht deren Löschung wählen.',
      'dialog.checking': 'Verknüpfte Sitzungen und Dateien werden geprüft…',
      'dialog.confirmTitle': 'Löschen bestätigen',
      'dialog.confirmDetail': 'Sitzung „{title}“ wird endgültig gelöscht. Dies kann nicht rückgängig gemacht werden.',
      'dialog.confirmDetailUntitled': 'Diese Sitzung wird endgültig gelöscht. Dies kann nicht rückgängig gemacht werden.',
      'dialog.typeWord': 'Geben Sie {word} im Feld unten ein und drücken Sie dann Ja.',
      'dialog.placeholder': 'delete',
      'dialog.deleting': 'Wird gelöscht…',
      'dialog.yes': 'Ja',
      'dialog.no': 'Nein',
      'dialog.close': 'Schließen',
      'related.title': 'Sitzung ist mit anderen Sitzungen verknüpft',
      'related.desc': 'Verknüpfte Sitzungen: {count}. Untergeordnete Sitzungen werden mit dieser gelöscht.',
      'related.note': 'Prüfen Sie die verknüpften Sitzungen, bevor Sie fortfahren.',
      'related.show': 'Liste anzeigen ({count})',
      'related.parent': 'übergeordnete Sitzung',
      'related.child': 'untergeordnete Sitzung',
      'related.running': 'aktiv',
      'related.untitled': 'Unbenannte Sitzung',
      'files.checkbox': 'Auch die von dieser Sitzung erstellten Dateien löschen ({count})',
      'files.show': 'Pfade anzeigen ({count})',
      'files.risk': 'Diese Projektdateien werden von der Festplatte entfernt. Das ist nicht rückgängig zu machen.',
      'session.liveNote': 'Diese Sitzung ist gerade geöffnet. Sie wird beim Löschen geschlossen.',
      'session.runningNote': 'Diese Sitzung erzeugt gerade eine Antwort. Sie wird beim Löschen beendet und geschlossen.',
      'error.active': 'Die Sitzung konnte nicht geschlossen werden. Versuchen Sie es erneut.',
      'error.notFound': 'Diese Sitzung existiert nicht mehr.',
      'error.invalid': 'Die Anfrage wurde abgelehnt.',
      'error.network': 'Die Anfrage ist fehlgeschlagen. Es wurde nichts gelöscht.',
      'error.generic': 'Vorgang fehlgeschlagen: {message}',
    }

    const es = {
      'menu.delete': 'Eliminar sesión',
      'dialog.title': '¿Eliminar sesión?',
      'dialog.question': '¿Seguro que quiere eliminar esta sesión?',
      'dialog.detail': 'Se eliminarán el historial, la caché de proyecciones y la entrada del espacio de trabajo. Los archivos del proyecto en disco se conservan salvo que elija eliminarlos en el siguiente paso.',
      'dialog.checking': 'Comprobando sesiones vinculadas y archivos…',
      'dialog.confirmTitle': 'Confirmar eliminación',
      'dialog.confirmDetail': 'La sesión «{title}» se eliminará de forma permanente. Esta acción no se puede deshacer.',
      'dialog.confirmDetailUntitled': 'Esta sesión se eliminará de forma permanente. Esta acción no se puede deshacer.',
      'dialog.typeWord': 'Escriba {word} en el campo y pulse Sí.',
      'dialog.placeholder': 'delete',
      'dialog.deleting': 'Eliminando…',
      'dialog.yes': 'Sí',
      'dialog.no': 'No',
      'dialog.close': 'Cerrar',
      'related.title': 'La sesión está vinculada a otras sesiones',
      'related.desc': 'Sesiones vinculadas: {count}. Las sesiones descendientes se eliminarán con esta.',
      'related.note': 'Revise las sesiones vinculadas antes de continuar.',
      'related.show': 'Mostrar la lista ({count})',
      'related.parent': 'sesión principal',
      'related.child': 'sesión secundaria',
      'related.running': 'activa',
      'related.untitled': 'Sesión sin título',
      'files.checkbox': 'Eliminar también los archivos creados por esta sesión ({count})',
      'files.show': 'Mostrar las rutas ({count})',
      'files.risk': 'Estos archivos del proyecto se eliminarán del disco. No se pueden recuperar.',
      'session.liveNote': 'Esta sesión está abierta ahora mismo. Se cerrará al eliminarla.',
      'session.runningNote': 'Esta sesión está generando una respuesta. Se detendrá y se cerrará al eliminarla.',
      'error.active': 'No se pudo cerrar la sesión. Inténtelo de nuevo.',
      'error.notFound': 'Esta sesión ya no existe.',
      'error.invalid': 'La solicitud fue rechazada.',
      'error.network': 'La solicitud falló. No se eliminó nada.',
      'error.generic': 'La operación falló: {message}',
    }

    const fr = {
      'menu.delete': 'Supprimer la session',
      'dialog.title': 'Supprimer la session ?',
      'dialog.question': 'Voulez-vous vraiment supprimer cette session ?',
      'dialog.detail': 'L’historique, le cache de projections et l’entrée d’espace de travail seront supprimés. Les fichiers du projet sur le disque sont conservés, sauf si vous choisissez de les supprimer à l’étape suivante.',
      'dialog.checking': 'Vérification des sessions liées et des fichiers…',
      'dialog.confirmTitle': 'Confirmer la suppression',
      'dialog.confirmDetail': 'La session « {title} » sera définitivement supprimée. Cette action est irréversible.',
      'dialog.confirmDetailUntitled': 'Cette session sera définitivement supprimée. Cette action est irréversible.',
      'dialog.typeWord': 'Saisissez {word} dans le champ ci-dessous, puis appuyez sur Oui.',
      'dialog.placeholder': 'delete',
      'dialog.deleting': 'Suppression…',
      'dialog.yes': 'Oui',
      'dialog.no': 'Non',
      'dialog.close': 'Fermer',
      'related.title': 'La session est liée à d’autres sessions',
      'related.desc': 'Sessions liées : {count}. Les sessions descendantes seront supprimées avec celle-ci.',
      'related.note': 'Vérifiez les sessions liées avant de continuer.',
      'related.show': 'Afficher la liste ({count})',
      'related.parent': 'session parente',
      'related.child': 'session enfant',
      'related.running': 'en cours',
      'related.untitled': 'Session sans titre',
      'files.checkbox': 'Supprimer aussi les fichiers créés par cette session ({count})',
      'files.show': 'Afficher les chemins ({count})',
      'files.risk': 'Ces fichiers du projet seront supprimés du disque. C’est irréversible.',
      'session.liveNote': 'Cette session est actuellement ouverte. Elle sera fermée lors de la suppression.',
      'session.runningNote': 'Cette session génère une réponse. Elle sera arrêtée et fermée lors de la suppression.',
      'error.active': 'Impossible de fermer la session. Réessayez.',
      'error.notFound': 'Cette session n’existe plus.',
      'error.invalid': 'La requête a été refusée.',
      'error.network': 'La requête a échoué. Rien n’a été supprimé.',
      'error.generic': 'Échec de l’opération : {message}',
    }

    const ja = {
      'menu.delete': 'セッションを削除',
      'dialog.title': 'セッションを削除しますか？',
      'dialog.question': 'このセッションを本当に削除しますか？',
      'dialog.detail': '会話履歴、プロジェクションキャッシュ、ワークスペースの登録を削除します。次の手順で選択しない限り、ディスク上のプロジェクトファイルは残ります。',
      'dialog.checking': '関連するセッションとファイルを確認しています…',
      'dialog.confirmTitle': '削除の確認',
      'dialog.confirmDetail': 'セッション「{title}」は完全に削除されます。この操作は元に戻せません。',
      'dialog.confirmDetailUntitled': 'このセッションは完全に削除されます。この操作は元に戻せません。',
      'dialog.typeWord': '下の欄に {word} と入力してから「はい」を押してください。',
      'dialog.placeholder': 'delete',
      'dialog.deleting': '削除しています…',
      'dialog.yes': 'はい',
      'dialog.no': 'いいえ',
      'dialog.close': '閉じる',
      'related.title': 'セッションは他のセッションと関連しています',
      'related.desc': '関連するセッション: {count}。子セッションも一緒に削除されます。',
      'related.note': '続行する前に関連するセッションを確認してください。',
      'related.show': '一覧を表示 ({count})',
      'related.parent': '親セッション',
      'related.child': '子セッション',
      'related.running': '実行中',
      'related.untitled': '無題のセッション',
      'files.checkbox': 'このセッションが作成したファイルも削除する ({count})',
      'files.show': 'パスを表示 ({count})',
      'files.risk': 'これらのプロジェクトファイルはディスクから削除されます。元に戻せません。',
      'session.liveNote': 'このセッションは現在開かれています。削除時に閉じられます。',
      'session.runningNote': 'このセッションは応答を生成中です。削除時に停止して閉じます。',
      'error.active': 'セッションを閉じられませんでした。もう一度お試しください。',
      'error.notFound': 'このセッションはもう存在しません。',
      'error.invalid': 'リクエストは拒否されました。',
      'error.network': 'リクエストに失敗しました。何も削除されていません。',
      'error.generic': '操作に失敗しました: {message}',
    }

    const pt = {
      'menu.delete': 'Excluir sessão',
      'dialog.title': 'Excluir sessão?',
      'dialog.question': 'Tem certeza de que deseja excluir esta sessão?',
      'dialog.detail': 'O histórico, o cache de projeções e o registro no workspace serão removidos. Os arquivos do projeto no disco são mantidos, a menos que você escolha excluí-los na próxima etapa.',
      'dialog.checking': 'Verificando sessões vinculadas e arquivos…',
      'dialog.confirmTitle': 'Confirmar exclusão',
      'dialog.confirmDetail': 'A sessão «{title}» será excluída permanentemente. Esta ação não pode ser desfeita.',
      'dialog.confirmDetailUntitled': 'Esta sessão será excluída permanentemente. Esta ação não pode ser desfeita.',
      'dialog.typeWord': 'Digite {word} no campo abaixo e pressione Sim.',
      'dialog.placeholder': 'delete',
      'dialog.deleting': 'Excluindo…',
      'dialog.yes': 'Sim',
      'dialog.no': 'Não',
      'dialog.close': 'Fechar',
      'related.title': 'A sessão está vinculada a outras sessões',
      'related.desc': 'Sessões vinculadas: {count}. As sessões descendentes serão excluídas junto com esta.',
      'related.note': 'Revise as sessões vinculadas antes de continuar.',
      'related.show': 'Mostrar a lista ({count})',
      'related.parent': 'sessão pai',
      'related.child': 'sessão filha',
      'related.running': 'em execução',
      'related.untitled': 'Sessão sem título',
      'files.checkbox': 'Excluir também os arquivos criados por esta sessão ({count})',
      'files.show': 'Mostrar os caminhos ({count})',
      'files.risk': 'Esses arquivos do projeto serão removidos do disco. Não é possível desfazer.',
      'session.liveNote': 'Esta sessão está aberta agora. Ela será fechada ao ser excluída.',
      'session.runningNote': 'Esta sessão está gerando uma resposta. Ela será interrompida e fechada ao ser excluída.',
      'error.active': 'Não foi possível fechar a sessão. Tente novamente.',
      'error.notFound': 'Esta sessão não existe mais.',
      'error.invalid': 'A solicitação foi recusada.',
      'error.network': 'A solicitação falhou. Nada foi excluído.',
      'error.generic': 'Falha na operação: {message}',
    }

    const zh = {
      'menu.delete': '删除会话',
      'dialog.title': '删除会话？',
      'dialog.question': '您确定要删除此会话吗？',
      'dialog.detail': '将删除对话历史、投影缓存和工作区记录。除非在下一步选择，磁盘上的项目文件会保留。',
      'dialog.checking': '正在检查关联会话和文件…',
      'dialog.confirmTitle': '确认删除',
      'dialog.confirmDetail': '会话“{title}”将被永久删除。此操作无法撤销。',
      'dialog.confirmDetailUntitled': '此会话将被永久删除。此操作无法撤销。',
      'dialog.typeWord': '在下方输入 {word}，然后点击“是”。',
      'dialog.placeholder': 'delete',
      'dialog.deleting': '正在删除…',
      'dialog.yes': '是',
      'dialog.no': '否',
      'dialog.close': '关闭',
      'related.title': '会话与其他会话相关联',
      'related.desc': '关联会话：{count}。子会话也将随之删除。',
      'related.note': '继续前请检查关联会话。',
      'related.show': '显示列表（{count}）',
      'related.parent': '父会话',
      'related.child': '子会话',
      'related.running': '运行中',
      'related.untitled': '未命名会话',
      'files.checkbox': '同时删除此会话创建的文件（{count}）',
      'files.show': '显示路径（{count}）',
      'files.risk': '这些项目文件将从磁盘删除，无法恢复。',
      'session.liveNote': '此会话当前已打开，删除时会被关闭。',
      'session.runningNote': '此会话正在生成回复，删除时会被停止并关闭。',
      'error.active': '无法关闭会话。请重试。',
      'error.notFound': '此会话已不存在。',
      'error.invalid': '请求被拒绝。',
      'error.network': '请求失败，未删除任何内容。',
      'error.generic': '操作失败：{message}',
    }

    const dictionaries = { en, ru, de, es, fr, ja, pt, zh }

    const CSS = `
.${P}-item-wrap{position:relative}
.${P}-separator{height:.5px;margin:3px 8px;background:var(--dsw-alias-border-l2,#e3e3e6)}
.${P}-item{display:flex;align-items:center;gap:6px;width:100%;min-height:34px;padding:6px 8px;border:none;border-radius:var(--dsw-radius-md,8px);background:transparent;cursor:pointer;font:inherit;font-size:13px;line-height:20px;color:var(--dsw-alias-label-primary,#16181d);text-align:left}
.${P}-item:focus-visible{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.06));outline:none}
.${P}-item-danger,.${P}-item-danger .${P}-item-icon{color:var(--dsw-alias-state-error-primary,#d92d20)}
.${P}-item-icon{display:inline-flex;flex:none;width:14px;height:14px;align-items:center;justify-content:center;color:var(--dsw-alias-menu-icon,currentColor)}
.${P}-item-label{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
@media(hover:hover){
.${P}-item:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.06))}
.${P}-item-danger:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover-danger,rgba(217,45,32,.08))}
}
.${P}-root{pointer-events:auto;position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;padding:max(24px,var(--dsh-frame-overlay-top,24px)) 24px}
.${P}-mask{position:absolute;inset:var(--dsh-frame-chrome-top,0px) 0 0;backdrop-filter:var(--dsw-mask-blur,blur(2px))}
.${P}-mask:after{content:"";position:absolute;inset:0;background:var(--dsw-alias-bg-mask-1,rgba(0,0,0,.35));animation:${P}-enter var(--ds-transition-duration,150ms) var(--ds-ease-in-out,ease)}
.${P}-dialog{box-sizing:border-box;position:relative;z-index:1;display:flex;flex-direction:column;gap:20px;width:min(460px,100%);max-height:calc(100dvh - 48px);padding:0 0 24px;overflow:hidden;border:0;border-radius:var(--dsw-radius-panel,16px);background:var(--dsw-alias-bg-layer-2,#fff);box-shadow:var(--dsw-elevation-prominent,0 12px 40px rgba(0,0,0,.24));color:var(--dsw-alias-label-primary,#16181d);font:inherit;animation:${P}-enter var(--ds-transition-duration,150ms) var(--ds-ease-in-out,ease)}
.${P}-dialog:focus{outline:none}
.${P}-content{display:flex;flex-direction:column;width:100%;min-height:0;overflow-y:auto;overscroll-behavior:contain}
.${P}-header{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:22px 14px 12px 24px}
.${P}-title{margin:0;font-size:16px;line-height:24px;font-weight:500;color:var(--dsw-alias-label-primary,#16181d)}
.${P}-close{flex:none;display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border:none;border-radius:var(--dsw-radius-sm,6px);background:transparent;cursor:pointer;color:var(--dsw-alias-label-secondary,#5a6070)}
.${P}-close:disabled{opacity:.4;cursor:not-allowed}
.${P}-description{margin:0;padding:0 24px;font-size:14px;line-height:22px;font-weight:400;color:var(--dsw-alias-label-primary,#16181d)}
.${P}-body{display:flex;flex-direction:column;gap:12px;min-width:0;margin-top:20px;padding:0 24px}
.${P}-note{margin:0;font-size:14px;line-height:22px;color:var(--dsw-alias-label-secondary,#5a6070)}
.${P}-warning{display:flex;align-items:flex-start;gap:10px;font-size:14px;line-height:22px;color:var(--dsw-alias-label-secondary,#5a6070)}
.${P}-warning p{margin:0}
.${P}-warning svg{margin-top:2px;color:var(--dsw-alias-state-error-primary,#d92d20)}
.${P}-footer{display:flex;align-items:center;justify-content:flex-end;gap:8px;padding:0 24px}
.${P}-button{box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;gap:4px;height:36px;padding:0 14px;border:none;border-radius:var(--dsw-radius-md,8px);background:transparent;cursor:pointer;font:inherit;font-size:14px;line-height:22px;color:var(--dsw-alias-label-primary,#16181d);min-width:72px}
.${P}-button:disabled{cursor:not-allowed;opacity:.4}
.${P}-button-outline{box-shadow:inset 0 0 0 var(--dsh-hairline-width,.5px) var(--dsh-button-outline-color,var(--dsw-alias-border-l3,#d5d7dd))}
.${P}-button-primary{background:var(--dsw-alias-button-primary-fill,#2a6df4);color:var(--dsw-alias-label-primary-foreground,#fff)}
.${P}-button-delete:not(:disabled){color:var(--dsw-alias-state-error-primary,#d92d20)}
.${P}-field{box-sizing:border-box;width:100%;height:44px;padding:7px 14px;border:.5px solid var(--dsw-alias-border-l4,#c9ccd4);border-radius:var(--dsw-radius-lg,12px);background:transparent;outline:none;font:inherit;font-size:16px;line-height:22px;color:var(--dsw-alias-label-primary,#16181d)}
.${P}-field::placeholder{color:var(--dsw-alias-label-dimmed,#9aa0ae)}
.${P}-field:focus{border-color:var(--dsw-alias-state-business-primary,var(--dsw-alias-brand-primary,#2a6df4))}
.${P}-field:disabled{color:var(--dsw-alias-label-dimmed,#9aa0ae)}
.${P}-status{margin:0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary,#5a6070)}
.${P}-error{margin:0;font-size:12px;line-height:18px;color:var(--dsw-alias-state-error-primary,#d92d20)}
.${P}-details{margin-top:2px}
.${P}-summary{cursor:pointer;color:var(--dsw-alias-label-secondary,#5a6070);font-size:13px;line-height:20px}
.${P}-summary:hover{color:var(--dsw-alias-label-primary,#16181d)}
.${P}-list{display:flex;flex-direction:column;gap:4px;max-height:190px;overflow:auto;margin-top:8px;padding:8px 10px;border-radius:var(--dsw-radius-md,8px);background:var(--dsw-alias-bg-layer-1,#f6f7f9);font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary,#5a6070)}
.${P}-row{display:flex;flex-direction:column;gap:1px;min-width:0}
.${P}-row-title{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-primary,#16181d);font-size:13px;line-height:18px}
.${P}-row-meta{color:var(--dsw-alias-label-tertiary,#7a8294);font-size:11px;line-height:16px}
.${P}-path{word-break:break-all}
.${P}-check{display:flex;align-items:flex-start;gap:10px;margin-top:2px;color:var(--dsw-alias-label-primary,#16181d);font-size:14px;line-height:22px;cursor:pointer}
.${P}-check input{flex:none;width:16px;height:16px;margin:3px 0 0;accent-color:var(--dsw-alias-button-primary-fill,#2a6df4);cursor:pointer}
.${P}-check input:disabled{cursor:default}
@media(hover:hover){
.${P}-button-primary:hover:not(:disabled){background:var(--dsw-alias-button-primary-hover,#1f5ada)}
.${P}-button-outline:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.06))}
.${P}-close:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.06))}
}
@keyframes ${P}-enter{0%{opacity:0}to{opacity:1}}
@media(prefers-reduced-motion:reduce){
.${P}-mask:after,.${P}-dialog{animation:none}
}
`

    /* ---------------------------------------------------------------- state */

    let pluginCtx = null
    let translate = (key) => key

    const initialState = {
      open: false,
      step: 'confirm',
      target: null,
      info: null,
      draft: '',
      busy: false,
      error: null,
      deleteFiles: false,
      relatedOpen: false,
      filesOpen: false,
    }

    let state = { ...initialState }
    const listeners = new Set()

    function getState() {
      return state
    }

    function patch(next) {
      state = { ...state, ...next }
      for (const listener of [...listeners]) {
        try {
          listener()
        } catch (error) {
          console.error('[session-delete] state listener failed:', error)
        }
      }
    }

    function subscribeState(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    }

    function usePluginStateSync() {
      return React.useSyncExternalStore(subscribeState, getState, getState)
    }

    function usePluginStateLegacy() {
      const [value, setValue] = React.useState(getState)
      React.useEffect(() => {
        setValue(getState())
        return subscribeState(() => setValue(getState()))
      }, [])
      return value
    }

    const usePluginState = typeof React.useSyncExternalStore === 'function'
      ? usePluginStateSync
      : usePluginStateLegacy

    /* -------------------------------------------------------------- actions */

    function openDialog(target) {
      patch({ ...initialState, open: true, target })
    }

    function closeDialog() {
      if (state.busy) return
      patch({ ...initialState })
    }

    function describeFailure(payload, status) {
      const code = payload !== null && typeof payload === 'object' && typeof payload.code === 'string' ? payload.code : ''
      if (code === 'session/active') return translate('error.active')
      if (code === 'session/not-found') return translate('error.notFound')
      if (code === 'request/invalid') return translate('error.invalid')
      const message = payload !== null && typeof payload === 'object' && typeof payload.message === 'string' && payload.message !== ''
        ? payload.message
        : `HTTP ${String(status)}`
      return translate('error.generic', { message })
    }

    async function postJson(endpoint, body) {
      const response = await fetch(endpoint, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      const payload = await response.json().catch(() => null)
      return { response, payload }
    }

    /** Step one: ask the Host what this deletion would touch. */
    async function startInspection() {
      const target = state.target
      if (target === null || state.busy) return
      patch({ busy: true, error: null })
      try {
        const { response, payload } = await postJson(INSPECT_PATH, { sessionId: target.sessionId })
        if (response.ok && payload !== null && payload.ok === true) {
          const related = Array.isArray(payload.related) ? payload.related : []
          patch({
            busy: false,
            info: payload,
            step: related.length > 0 ? 'related' : 'word',
            relatedOpen: false,
            filesOpen: false,
            deleteFiles: false,
            error: null,
          })
          return
        }
        patch({ busy: false, error: describeFailure(payload, response.status) })
      } catch (error) {
        console.error('[session-delete] inspect request failed:', error)
        patch({ busy: false, error: translate('error.network') })
      }
    }

    /** Last step: perform the confirmed deletion. */
    async function confirmDelete() {
      const target = state.target
      if (target === null || state.busy) return
      patch({ busy: true, error: null })
      try {
        const { response, payload } = await postJson(DELETE_PATH, {
          sessionId: target.sessionId,
          confirm: CONFIRM_WORD,
          deleteFiles: state.deleteFiles === true,
        })
        if (response.ok && payload !== null && payload.ok === true) {
          patch({ ...initialState })
          refreshSessions()
          return
        }
        patch({ busy: false, error: describeFailure(payload, response.status) })
      } catch (error) {
        console.error('[session-delete] delete request failed:', error)
        patch({ busy: false, error: translate('error.network') })
      }
    }

    /** Ask the Session Controller to re-read its durable list after a removal. */
    function refreshSessions() {
      if (pluginCtx === null) return
      const sessions = pluginCtx.get('sessions')
      if (sessions === undefined || sessions === null || typeof sessions.refresh !== 'function') return
      try {
        const pending = sessions.refresh()
        if (pending !== undefined && pending !== null && typeof pending.catch === 'function') {
          pending.catch((error) => console.warn('[session-delete] session list refresh failed:', error))
        }
      } catch (error) {
        console.warn('[session-delete] session list refresh failed:', error)
      }
    }

    /* ---------------------------------------------------------- primitives */

    function TrashIcon({ size = 14 }) {
      return h('svg', {
        viewBox: '0 0 24 24',
        width: size,
        height: size,
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.7,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': true,
        focusable: false,
        style: { display: 'block' },
      },
      h('path', { key: 'lid', d: 'M4 7h16' }),
      h('path', { key: 'handle', d: 'M9.5 4h5' }),
      h('path', { key: 'body', d: 'M6.5 7l.9 12.1a1 1 0 0 0 1 .9h7.2a1 1 0 0 0 1-.9L17.5 7' }),
      h('path', { key: 'ribs', d: 'M10 11v5.5M14 11v5.5' }))
    }

    function CloseIcon({ size = 14 }) {
      return h('svg', {
        viewBox: '0 0 24 24',
        width: size,
        height: size,
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.7,
        strokeLinecap: 'round',
        'aria-hidden': true,
        focusable: false,
        style: { display: 'block' },
      }, h('path', { d: 'M6 6l12 12M18 6L6 18' }))
    }

    function WarningIcon({ size = 18 }) {
      return h('svg', {
        viewBox: '0 0 24 24',
        width: size,
        height: size,
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.7,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': true,
        focusable: false,
        style: { display: 'block', flex: 'none' },
      },
      h('path', { key: 'shape', d: 'M12 3.6l9 15.8H3z' }),
      h('path', { key: 'stem', d: 'M12 9.5v4.4' }),
      h('path', { key: 'dot', d: 'M12 16.8h.01' }))
    }

    /**
     * Host-style modal: mask, dialog, header with title and close, description,
     * body and footer. Escape and mask clicks close; focus enters the dialog and
     * returns to the previously focused element on close.
     */
    function Modal({ open, onClose, closeLabel, title, description, footer, children, busy }) {
      const dialogRef = React.useRef(null)

      React.useEffect(() => {
        if (!open) return undefined
        const node = dialogRef.current
        const previous = document.activeElement
        const focusableSelector = 'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href], [tabindex="0"]'
        const focusTarget = node !== null
          ? node.querySelector('[data-modal-autofocus]') ?? node.querySelector(focusableSelector) ?? node
          : null
        if (focusTarget !== null && typeof focusTarget.focus === 'function') {
          focusTarget.focus({ preventScroll: true })
        }
        const onKeyDown = (event) => {
          if (event.key === 'Escape' && !event.shiftKey) {
            event.preventDefault()
            onClose()
            return
          }
          if (event.key !== 'Tab' || node === null) return
          const items = [...node.querySelectorAll(focusableSelector)].filter((element) => !element.closest('[inert], [hidden]'))
          if (items.length === 0) {
            event.preventDefault()
            node.focus({ preventScroll: true })
            return
          }
          const first = items[0]
          const last = items[items.length - 1]
          const active = document.activeElement
          const leavingStart = event.shiftKey && (active === first || active === node)
          const leavingEnd = !event.shiftKey && active === last
          if (leavingStart || leavingEnd) {
            event.preventDefault()
            ;(event.shiftKey ? last : first).focus({ preventScroll: true })
          }
        }
        document.addEventListener('keydown', onKeyDown, true)
        return () => {
          document.removeEventListener('keydown', onKeyDown, true)
          if (previous instanceof HTMLElement && previous.isConnected) {
            previous.focus({ preventScroll: true })
          }
        }
      }, [open])

      if (!open) return null
      return createPortal(h('div', { className: `${P}-root`, role: 'presentation' }, [
        h('div', {
          key: 'mask',
          className: `${P}-mask`,
          'aria-hidden': true,
          onClick: busy ? undefined : onClose,
        }),
        h('div', {
          key: 'dialog',
          ref: dialogRef,
          tabIndex: -1,
          className: `${P}-dialog`,
          role: 'dialog',
          'aria-modal': 'true',
          'aria-label': title,
        }, [
          h('div', { key: 'content', className: `${P}-content` }, [
            h('div', { key: 'header', className: `${P}-header` }, [
              h('h2', { key: 'title', className: `${P}-title` }, title),
              h('button', {
                key: 'close',
                type: 'button',
                className: `${P}-close`,
                'aria-label': closeLabel,
                disabled: busy === true,
                onClick: onClose,
              }, h(CloseIcon, { size: 14 })),
            ]),
            description !== undefined && description !== '' ? h('p', {
              key: 'description',
              className: `${P}-description`,
            }, description) : null,
            children !== undefined && children !== null ? h('div', {
              key: 'body',
              className: `${P}-body`,
            }, children) : null,
          ]),
          footer !== undefined && footer !== null ? h('div', {
            key: 'footer',
            className: `${P}-footer`,
          }, footer) : null,
        ]),
      ]), document.body)
    }

    function Button({ variant, danger, onClick, disabled, children }) {
      const classes = [`${P}-button`]
      if (variant === 'primary') classes.push(`${P}-button-primary`)
      else classes.push(`${P}-button-outline`)
      if (danger === true) classes.push(`${P}-button-delete`)
      return h('button', {
        type: 'button',
        className: classes.join(' '),
        disabled: disabled === true,
        onClick,
      }, children)
    }

    /** Expandable list of linked Sessions. */
    function RelatedList({ rows, open, onToggle, t }) {
      return h('details', {
        className: `${P}-details`,
        open,
        onToggle: (event) => onToggle(event.currentTarget.open),
      }, [
        h('summary', { key: 'summary', className: `${P}-summary` },
          t('related.show', { count: String(rows.length) })),
        h('div', { key: 'list', className: `${P}-list` }, rows.map((row) => h('div', {
          key: row.sessionId,
          className: `${P}-row`,
        }, [
          h('span', { key: 'title', className: `${P}-row-title` }, row.title === '' ? t('related.untitled') : row.title),
          h('span', { key: 'meta', className: `${P}-row-meta` }, [
            row.relation === 'parent' ? t('related.parent') : t('related.child'),
            row.running === true ? t('related.running') : null,
          ].filter(Boolean).join(' · ')),
        ]))),
      ])
    }

    /** Expandable list of project paths the Session named. */
    function FilesList({ files, open, onToggle, t }) {
      return h('details', {
        className: `${P}-details`,
        open,
        onToggle: (event) => onToggle(event.currentTarget.open),
      }, [
        h('summary', { key: 'summary', className: `${P}-summary` },
          t('files.show', { count: String(files.length) })),
        h('div', { key: 'list', className: `${P}-list` }, files.map((file) => h('div', {
          key: file.relative,
          className: `${P}-path`,
        }, file.relative))),
      ])
    }

    /* -------------------------------------------------------------- entries */

    function SessionDeleteMenuItem(props) {
      const sessionId = props.sessionId
      const displayTitle = props.displayTitle ?? ''
      const [, setMenuOpen] = props.useMenuOpenState()
      return h('div', { className: `${P}-item-wrap` }, [
        h('div', { key: 'separator', className: `${P}-separator`, role: 'separator' }),
        h('button', {
          key: 'item',
          type: 'button',
          role: 'menuitem',
          className: `${P}-item ${P}-item-danger`,
          onClick: () => {
            setMenuOpen(false)
            openDialog({ sessionId, displayTitle })
          },
        }, [
          h('span', { key: 'icon', className: `${P}-item-icon` }, h(TrashIcon, { size: 14 })),
          h('span', { key: 'label', className: `${P}-item-label` }, translate('menu.delete')),
        ]),
      ])
    }

    function SessionDeleteDialog() {
      const current = usePluginState()
      if (current.open !== true || current.target === null) return null

      const t = translate
      const target = current.target
      const info = current.info
      const related = info !== null && Array.isArray(info.related) ? info.related : []
      const files = info !== null && Array.isArray(info.files) ? info.files : []
      const busy = current.busy === true
      const typed = current.draft.trim().toLowerCase() === CONFIRM_WORD
      const errorNode = current.error === null
        ? null
        : h('p', { key: 'error', className: `${P}-error`, role: 'alert' }, current.error)

      const close = () => {
        closeDialog()
      }

      let title
      let description
      let body
      let footer

      if (current.step === 'related') {
        title = t('related.title')
        description = t('related.desc', { count: String(related.length) })
        body = [
          h('p', { key: 'note', className: `${P}-note` }, t('related.note')),
          h(RelatedList, {
            key: 'related',
            rows: related,
            open: current.relatedOpen === true,
            onToggle: (open) => patch({ relatedOpen: open }),
            t,
          }),
          errorNode,
        ]
        footer = [
          h(Button, { key: 'no', variant: 'outline', disabled: busy, onClick: close }, t('dialog.no')),
          h(Button, {
            key: 'yes',
            variant: 'primary',
            disabled: busy,
            onClick: () => patch({ step: 'word', error: null }),
          }, t('dialog.yes')),
        ]
      } else if (current.step === 'word') {
        const sessionTitle = info !== null && info.session !== undefined && typeof info.session.title === 'string'
          ? info.session.title
          : ''
        const shownTitle = sessionTitle !== '' ? sessionTitle : (target.displayTitle ?? '')
        title = t('dialog.confirmTitle')
        description = shownTitle === '' ? t('dialog.confirmDetailUntitled') : t('dialog.confirmDetail', { title: shownTitle })
        body = [
          h('div', { key: 'warning', className: `${P}-warning` }, [
            h(WarningIcon, { key: 'icon', size: 18 }),
            h('p', { key: 'prompt' }, t('dialog.typeWord', { word: CONFIRM_WORD })),
          ]),
          h('input', {
            key: 'field',
            type: 'text',
            className: `${P}-field`,
            value: current.draft,
            placeholder: t('dialog.placeholder'),
            autoComplete: 'off',
            autoCapitalize: 'off',
            autoCorrect: 'off',
            spellCheck: false,
            autoFocus: true,
            'data-modal-autofocus': true,
            disabled: busy,
            onChange: (event) => patch({ draft: event.target.value, error: null }),
            onKeyDown: (event) => {
              if (event.key !== 'Enter' || event.shiftKey) return
              event.preventDefault()
              if (current.draft.trim().toLowerCase() === CONFIRM_WORD && !busy) {
                void confirmDelete()
              }
            },
          }),
          info !== null && info.live === true
            ? h('p', { key: 'live', className: `${P}-note` }, info.running === true
              ? t('session.runningNote')
              : t('session.liveNote'))
            : null,
          files.length > 0 ? h('label', { key: 'check', className: `${P}-check` }, [
            h('input', {
              key: 'box',
              type: 'checkbox',
              checked: current.deleteFiles === true,
              disabled: busy,
              onChange: (event) => patch({ deleteFiles: event.target.checked }),
            }),
            h('span', { key: 'text' }, t('files.checkbox', { count: String(files.length) })),
          ]) : null,
          files.length > 0 ? h(FilesList, {
            key: 'files',
            files,
            open: current.filesOpen === true,
            onToggle: (open) => patch({ filesOpen: open }),
            t,
          }) : null,
          files.length > 0 && current.deleteFiles === true
            ? h('p', { key: 'risk', className: `${P}-error` }, t('files.risk'))
            : null,
          busy ? h('p', { key: 'status', className: `${P}-status`, role: 'status' }, t('dialog.deleting')) : null,
          errorNode,
        ]
        footer = [
          h(Button, { key: 'no', variant: 'outline', disabled: busy, onClick: close }, t('dialog.no')),
          h(Button, {
            key: 'yes',
            variant: 'outline',
            danger: true,
            disabled: busy || !typed,
            onClick: () => {
              void confirmDelete()
            },
          }, t('dialog.yes')),
        ]
      } else {
        title = t('dialog.title')
        description = t('dialog.question')
        body = [
          h('p', { key: 'note', className: `${P}-note` }, t('dialog.detail')),
          busy ? h('p', { key: 'status', className: `${P}-status`, role: 'status' }, t('dialog.checking')) : null,
          errorNode,
        ]
        footer = [
          h(Button, { key: 'no', variant: 'outline', disabled: busy, onClick: close }, t('dialog.no')),
          h(Button, {
            key: 'yes',
            variant: 'primary',
            disabled: busy,
            onClick: () => {
              void startInspection()
            },
          }, t('dialog.yes')),
        ]
      }

      return h(Modal, {
        open: true,
        onClose: close,
        closeLabel: t('dialog.close'),
        title,
        description,
        footer,
        busy,
      }, body)
    }

    /* ---------------------------------------------------------------- apply */

    function apply(ctx) {
      pluginCtx = ctx
      translate = ctx.locale.bind(NS)

      for (const [locale, dictionary] of Object.entries(dictionaries)) {
        ctx.effect(() => ctx.locale.register(NS, locale, dictionary), `session-delete: ${locale} dictionary`)
      }

      /* Re-render open surfaces with the new language; `translate` reads it live. */
      ctx.effect(() => ctx.locale.subscribe(() => patch({})), 'session-delete: locale changes')

      ctx.effect(() => {
        const tag = document.createElement('style')
        tag.dataset.plugin = 'dsh-session-delete'
        tag.dataset.pluginCss = 'dsh-session-delete/client.css'
        tag.textContent = CSS
        document.head.appendChild(tag)
        return () => {
          tag.remove()
        }
      }, 'session-delete: styles')

      ctx.slots.inject('sidebar.workspaces.session.menu.item', () => ctx.slots.register({
        name: 'sidebar.workspaces.session.menu.item',
        id: 'session-delete.delete',
        order: 500,
      }, SessionDeleteMenuItem))

      ctx.slots.inject('shell.overlay', () => ctx.slots.register({
        name: 'shell.overlay',
        id: 'session-delete.dialog',
        order: 1000,
      }, SessionDeleteDialog))
    }

    return {
      inject: ['slots', 'locale'],
      apply,
    }
  },
})
