// Textos da página de download, nos 10 idiomas mais falados do mundo.
//
// ## Por que um dicionário, e não dez páginas
//
// O repositório publica UM arquivo: `index.html`. Dez páginas seriam dez
// arquivos para manter, e o link que o usuário compartilha deixaria de ser o
// mesmo para todos. Aqui o conteúdo de todos os idiomas vai embutido no mesmo
// arquivo e a troca acontece no navegador.
//
// ## O que isso não pode custar
//
// A página tem de continuar legível sem JavaScript. Por isso o gerador
// **escreve** o idioma padrão no HTML: quem chega sem JS (ou um robô de busca)
// lê a página inteira em inglês. O script só troca o idioma quando o visitante
// pede — ou quando o navegador já vem em outro idioma.
//
// ## RTL
//
// Árabe e urdu são escritos da direita para a esquerda. Não basta traduzir: o
// script troca `dir` no `<html>` e o CSS usa propriedades lógicas
// (`margin-inline-start`, `inset-inline-end`), então a página inteira se
// espelha. Uma tradução árabe num layout LTR é ilegível na prática.
//
// ## Os dez
//
// English, 中文, हिन्दी, Español, Français, العربية, বাংলা, Português, Русский,
// اردو — os dez mais falados por número total de falantes (Ethnologue).
//
// ## Chaves
//
// Planas e com prefixo de seção (`card.size`, `verify.lede`). Os valores podem
// conter `{n}`, `{size}` e `{data}`: o script substitui por `data-i18n-vars`.
// Valores usados em `data-i18n-html` podem conter `<code>` e `<strong>` — e só
// esses: `traducoesInvalidas()` recusa qualquer outra tag, que é o que impede
// uma tradução de virar execução de script.

/** Idiomas publicados, na ordem em que aparecem no menu. */
export const IDIOMAS = [
  { code: "en", nome: "English", proprio: "English", dir: "ltr", bcp47: "en" },
  { code: "zh", nome: "Chinese (Mandarin)", proprio: "中文", dir: "ltr", bcp47: "zh-CN" },
  { code: "hi", nome: "Hindi", proprio: "हिन्दी", dir: "ltr", bcp47: "hi" },
  { code: "es", nome: "Spanish", proprio: "Español", dir: "ltr", bcp47: "es" },
  { code: "fr", nome: "French", proprio: "Français", dir: "ltr", bcp47: "fr" },
  { code: "ar", nome: "Arabic", proprio: "العربية", dir: "rtl", bcp47: "ar" },
  { code: "bn", nome: "Bengali", proprio: "বাংলা", dir: "ltr", bcp47: "bn" },
  { code: "pt", nome: "Portuguese", proprio: "Português", dir: "ltr", bcp47: "pt-BR" },
  { code: "ru", nome: "Russian", proprio: "Русский", dir: "ltr", bcp47: "ru" },
  { code: "ur", nome: "Urdu", proprio: "اردو", dir: "rtl", bcp47: "ur" },
];

/**
 * Idioma escrito no HTML pelo gerador.
 *
 * Inglês porque a página é publicada para o mundo: é o único dos dez que a
 * maioria dos visitantes de fora consegue ler, e quem tem outro idioma no
 * navegador recebe o dele automaticamente.
 */
export const PADRAO = "en";

/** Todos os textos, por idioma. */
export const TEXTOS = {
  en: {
    "meta.title": "Giochi OS — download",
    "meta.description":
      "Giochi OS images for every supported device. A clean Linux system; apps install from the store.",
    "meta.ogDescription":
      "An image ready for the card, per device. The system is clean Linux; apps live outside the image.",

    "nav.language": "Language",
    "nav.download": "Download",
    "nav.install": "Install",
    "nav.devices": "Devices",
    "nav.project": "Project",
    "nav.checksum": "Check the checksum",
    "nav.sdCard": "SD card",
    "nav.qemu": "Virtual machine (QEMU)",
    "nav.deviceList": "List and requirements",
    "nav.about": "How it is made",
    "nav.repos": "Repositories",
    "nav.license": "Licenses",
    "nav.noJs": "The language switcher needs JavaScript. This page is in English.",

    "hero.eyebrow": "Handheld console · ARM64",
    "hero.title": "The system and the apps, in one place.",
    "hero.lede":
      "Giochi OS is the clean Linux base built with Buildroot, delivered as an image ready for the card. There is also a virtual machine image, to try it in QEMU without hardware. Apps live outside the image: you install them from the store, on the writable partition, and you can replace them whenever you want.",
    "hero.cta.download": "See images",
    "hero.cta.devices": "Supported devices",
    "hero.count": "{n} release(s) published · generated on {data}",

    "downloads.title": "Images by device",
    "downloads.lede":
      "Every image is specific to the hardware: kernel, device tree, panel driver and partition layout belong to the device, they are not generic. The virtual machine ones carry the QEMU command in the card itself.",

    "card.size": "Size",
    "card.buildroot": "Buildroot",
    "card.appsImage": "Apps in the image",
    "card.appsStore": "Apps in the store",
    "card.kernel": "Kernel",
    "card.showApps": "See the {n} app(s)",
    "card.unavailable": "image unavailable",
    "card.downloadCard": "Download image ({size})",
    "card.downloadDisk": "Download disk ({size})",
    "card.kernelButton": "Kernel ({size})",
    "card.checksum": "Checksum",
    "card.instructions": "Instructions",
    "card.kindCard": "SD card",
    "card.kindVirtual": "Virtual machine",
    "card.hintTitle": "This download is compressed. <strong>Uncompress before writing</strong> — <code>dd</code> copies raw bytes:",
    "card.runSummary": "How to start in QEMU",
    "card.runFirst": "Uncompress first:",
    "card.runNotes":
      "Login <code>root</code>, password <code>giochi-system</code>. To leave the console: <code>Ctrl+A</code>, then <code>X</code>. This image is headless: the console is the interface. Apps are in <code>/opt/giochi/apps</code> — run the launcher with <code>SDL_VIDEODRIVER=dummy</code>.",

    "verify.title": "Check the checksum",
    "verify.lede":
      "Each device has its own checksum file, and it covers <strong>every</strong> file of that device — image, kernel and anything else published. If one does not match, the download is corrupt: download it again before writing.",
    "verify.place": "Replace <code>&lt;device&gt;</code> with your device id. Every line that does not say <code>OK</code> is a file you cannot use.",
    "verify.step1": "Download the device checksum",
    "verify.step2": "Run it in the same folder as the files",
    "verify.step3": "Full instructions",
    "verify.step3note":
      "Each device also publishes a <code>&lt;device&gt;-README.txt</code> with the step by step for that file — write it to the card or start it in the virtual machine.",

    "write.title": "Write to the SD card",
    "write.lede":
      "Only for the <strong>SD card</strong> images. The <strong>virtual machine</strong> ones do not go on a card: uncompress them and run the command in the device card.",
    "write.step1": "Uncompress",
    "write.step1note":
      "<code>dd</code> writes raw bytes. Pointing it at the <code>.xz</code> would write the compressed file to the card and the device would not boot. Zstd: <code>zstd -d</code>; gzip: <code>gunzip -k</code>.",
    "write.step2": "Find the device",
    "write.step2note":
      "The card is usually <code>/dev/sdX</code> or <code>/dev/mmcblkX</code>. Check the size: a 32 GB card shows up as about 29 GB.",
    "write.step3": "Write",
    "write.step3note":
      "<strong>The card will be erased completely.</strong> <code>conv=fsync</code> is not optional — without it the write can be truncated.",
    "write.step4": "Check the result",
    "write.step4note":
      "The partition number changes with the device layout — the <code>README.txt</code> of your device tells you which. A filesystem error here means a bad card or an interrupted write.",

    "qemu.title": "Run in a virtual machine",
    "qemu.lede":
      "Useful to get to know the system and to test without hardware. It is not the device: without a GPU, 3D games do not open, and the serial console is the interface.",
    "qemu.empty": "No virtual machine image published right now. When there is one, the exact command appears here and in its card.",

    "devices.title": "Supported devices",
    "devices.lede":
      "What is published now. A device enters this list when there is an image built and verified for it — the list is the one from the releases, not a roadmap promise.",
    "devices.thDevice": "Device",
    "devices.thId": "Id",
    "devices.thArch": "Architecture",
    "devices.thType": "Type",
    "devices.thVersion": "Version",
    "devices.thSize": "Size",
    "devices.thApps": "Apps",
    "devices.note":
      "<strong>Type</strong> tells the destination of the file: <em>SD card</em> is for writing to the device; <em>Virtual machine</em> is a QEMU disk, and writing it to a card does not produce a device that boots.",

    "about.title": "How it is made",
    "about.systemTitle": "Giochi System",
    "about.systemText":
      "Builds the clean Linux with Buildroot: kernel, rootfs, boot, drivers and panel for each device. No user interface here.",
    "about.appTitle": "Giochi app",
    "about.appText":
      "The apps, each one with its requirements manifest. The system compares the manifest with the device profile before installing.",
    "about.gamesTitle": "Giochi games",
    "about.gamesText":
      "The games, with the same manifest. They go into the image when their distribution is <code>image</code>; otherwise they stay in the store.",
    "about.osTitle": "Giochi OS",
    "about.osText":
      "Joins the three: embeds the image apps into the rootfs, checks the result inside the image and publishes it with a checksum. This page.",
    "about.noteTitle": "Why apps live outside the image",
    "about.noteText":
      "The root is signed and read-only. Apps installed in <code>/user</code> can be replaced by the user — including by a modified version, which is what the GPL requires of GPL software. That is why the store runs on the computer and sends the package ready, instead of embedding everything in the image.",

    "repos.title": "Repositories",
    "repos.lede":
      "Independent repositories. Nothing is imported from one into another: the path comes as an argument and the only coupling is the JSON contract.",
    "repos.system": "the clean Linux for each device",
    "repos.app": "the apps and the store",
    "repos.games": "the games",
    "repos.os": "this repository: joins and publishes",
    "repos.all": "All releases",

    "license.title": "Licenses",
    "license.systemTitle": "System",
    "license.systemText":
      "Giochi System is MIT licensed. Buildroot and kernel components keep their original licenses; the text of each one is inside the image, in <code>/usr/share/licenses</code>.",
    "license.appsTitle": "Apps and games",
    "license.appsText":
      "Proprietary license, declared in each app manifest. An app whose license is incompatible with the image is refused at packaging time — the check is here, it does not depend on another repository having run first.",
    "license.note":
      "Free software, no warranty. Writing an image erases the card — check the device before.",

    "foot.line": "Giochi OS · system under MIT license · own apps under proprietary license",
    "foot.code": "code",
    "foot.releases": "releases",
    "foot.docs": "technical documentation",
    "note.title": "Notes",
    "note.painel": "Built and tested with the <code>{modelo}</code> screen. Units with {outros} need another build — the panel has no EDID, so the system cannot detect it.",
    "note.compat": "Also runs on some units of {lista} and variants (same board).",
  },

  zh: {
    "meta.title": "Giochi OS — 下载",
    "meta.description": "适用于每台受支持设备的 Giochi OS 镜像。干净的 Linux 系统；应用从商店安装。",
    "meta.ogDescription": "按设备提供可直接写入存储卡的镜像。系统是干净的 Linux；应用在镜像之外。",

    "nav.language": "语言",
    "nav.download": "下载",
    "nav.install": "安装",
    "nav.devices": "设备",
    "nav.project": "项目",
    "nav.checksum": "校验文件完整性",
    "nav.sdCard": "SD 存储卡",
    "nav.qemu": "虚拟机（QEMU）",
    "nav.deviceList": "列表与要求",
    "nav.about": "制作方式",
    "nav.repos": "代码仓库",
    "nav.license": "许可证",
    "nav.noJs": "语言切换需要 JavaScript。本页为英文。",

    "hero.eyebrow": "掌机 · ARM64",
    "hero.title": "系统和应用，都在同一个地方。",
    "hero.lede":
      "Giochi OS 是用 Buildroot 构建的干净 Linux 基础系统，以可直接写入存储卡的镜像形式发布。也有虚拟机镜像，可以在没有硬件的情况下用 QEMU 试用。应用在镜像之外：你从商店安装到可写分区，并且随时可以替换它们。",
    "hero.cta.download": "查看镜像",
    "hero.cta.devices": "支持的设备",
    "hero.count": "已发布 {n} 个版本 · 生成于 {data}",

    "downloads.title": "按设备划分的镜像",
    "downloads.lede":
      "每个镜像都针对具体硬件：内核、设备树、屏幕驱动和分区布局属于该设备，不是通用的。虚拟机镜像的卡片里直接带有 QEMU 命令。",

    "card.size": "大小",
    "card.buildroot": "Buildroot",
    "card.appsImage": "镜像内置应用",
    "card.appsStore": "商店应用",
    "card.kernel": "内核",
    "card.showApps": "查看 {n} 个应用",
    "card.unavailable": "镜像不可用",
    "card.downloadCard": "下载镜像（{size}）",
    "card.downloadDisk": "下载磁盘（{size}）",
    "card.kernelButton": "内核（{size}）",
    "card.checksum": "校验和",
    "card.instructions": "说明",
    "card.kindCard": "SD 存储卡",
    "card.kindVirtual": "虚拟机",
    "card.hintTitle": "此下载是压缩文件。<strong>写入前请先解压</strong> —— <code>dd</code> 复制原始字节：",
    "card.runSummary": "如何在 QEMU 中启动",
    "card.runFirst": "请先解压：",
    "card.runNotes":
      "登录 <code>root</code>，密码 <code>giochi-system</code>。退出控制台：<code>Ctrl+A</code>，然后 <code>X</code>。此镜像没有图形界面：控制台就是界面。应用在 <code>/opt/giochi/apps</code> —— 用 <code>SDL_VIDEODRIVER=dummy</code> 运行启动器。",

    "verify.title": "校验文件完整性",
    "verify.lede":
      "每台设备都有自己的校验文件，它覆盖该设备的<strong>所有</strong>文件 —— 镜像、内核以及其他发布的内容。如果有任何一行不匹配，说明下载已损坏：请重新下载再写入。",
    "verify.place": "把 <code>&lt;device&gt;</code> 换成你的设备 id。任何不是 <code>OK</code> 的行都是不能使用的文件。",
    "verify.step1": "下载该设备的校验文件",
    "verify.step2": "在与文件相同的目录中运行",
    "verify.step3": "完整说明",
    "verify.step3note":
      "每台设备还会发布一个 <code>&lt;device&gt;-README.txt</code>，其中是该文件的逐步说明 —— 写入存储卡或在虚拟机中启动。",

    "write.title": "写入 SD 存储卡",
    "write.lede":
      "仅适用于 <strong>SD 存储卡</strong>镜像。<strong>虚拟机</strong>镜像不要写入存储卡：请解压并运行设备卡片中的命令。",
    "write.step1": "解压",
    "write.step1note":
      "<code>dd</code> 写入原始字节。如果指向 <code>.xz</code>，会把压缩文件写进存储卡，设备无法启动。Zstd：<code>zstd -d</code>；gzip：<code>gunzip -k</code>。",
    "write.step2": "确认设备名",
    "write.step2note":
      "存储卡通常是 <code>/dev/sdX</code> 或 <code>/dev/mmcblkX</code>。请核对容量：32 GB 的卡显示约为 29 GB。",
    "write.step3": "写入",
    "write.step3note":
      "<strong>存储卡将被完全擦除。</strong><code>conv=fsync</code> 不是可选项 —— 没有它写入可能被截断。",
    "write.step4": "检查结果",
    "write.step4note":
      "分区号随设备布局而变 —— 你设备的 <code>README.txt</code> 会说明是哪一个。这里出现文件系统错误，意味着卡有问题或写入被中断。",

    "qemu.title": "在虚拟机中运行",
    "qemu.lede":
      "适合了解系统并在没有硬件时测试。它不是那台设备：没有 GPU，3D 游戏无法打开，串口控制台就是界面。",
    "qemu.empty": "目前没有已发布的虚拟机镜像。有之后，准确的命令会出现在这里和它的卡片中。",

    "devices.title": "支持的设备",
    "devices.lede":
      "当前已发布的内容。设备只有在有了为它构建并验证过的镜像后才进入这个列表 —— 这个列表来自版本发布，不是路线图承诺。",
    "devices.thDevice": "设备",
    "devices.thId": "标识",
    "devices.thArch": "架构",
    "devices.thType": "类型",
    "devices.thVersion": "版本",
    "devices.thSize": "大小",
    "devices.thApps": "应用",
    "devices.note":
      "<strong>类型</strong>说明文件的用途：<em>SD 存储卡</em>用于写入设备；<em>虚拟机</em>是 QEMU 磁盘，把它写入存储卡不会得到能启动的设备。",

    "about.title": "制作方式",
    "about.systemTitle": "Giochi System",
    "about.systemText": "用 Buildroot 构建干净的 Linux：每台设备的内核、rootfs、启动、驱动和屏幕。这里没有用户界面。",
    "about.appTitle": "Giochi app",
    "about.appText": "应用，每个都有自己的需求清单。系统在安装前把清单与设备配置比较。",
    "about.gamesTitle": "Giochi games",
    "about.gamesText": "游戏，使用相同的清单。当发行方式是 <code>image</code> 时它们进入镜像；否则留在商店。",
    "about.osTitle": "Giochi OS",
    "about.osText":
      "把三个合在一起：把镜像应用放进 rootfs，在镜像内部核对结果，并带校验和发布。就是本页。",
    "about.noteTitle": "为什么应用在镜像之外",
    "about.noteText":
      "根文件系统是签名且只读的。安装在 <code>/user</code> 的应用可以被用户替换 —— 包括被修改过的版本，而这正是 GPL 对 GPL 软件的要求。所以商店在电脑上运行并直接发送打包好的应用，而不是把所有东西都塞进镜像。",

    "repos.title": "代码仓库",
    "repos.lede": "相互独立的仓库。没有任何内容从一处导入另一处：路径作为参数传入，唯一的耦合是 JSON 约定。",
    "repos.system": "每台设备的干净 Linux",
    "repos.app": "应用和商店",
    "repos.games": "游戏",
    "repos.os": "本仓库：合并并发布",
    "repos.all": "所有版本",

    "license.title": "许可证",
    "license.systemTitle": "系统",
    "license.systemText":
      "Giochi System 使用 MIT 许可证。Buildroot 和内核组件保留原始许可证；每份许可证的文本都在镜像内的 <code>/usr/share/licenses</code>。",
    "license.appsTitle": "应用和游戏",
    "license.appsText":
      "专有许可证，在每个应用清单中声明。与镜像许可证不兼容的应用会在打包时被拒绝 —— 这项检查在这里，不依赖另一个仓库先运行。",
    "license.note": "自由软件，不提供担保。写入镜像会擦除存储卡 —— 请先确认设备。",

    "foot.line": "Giochi OS · 系统使用 MIT 许可证 · 自有应用使用专有许可证",
    "foot.code": "代码",
    "foot.releases": "版本发布",
    "foot.docs": "技术文档",
    "note.title": "注意事项",
    "note.painel": "使用 <code>{modelo}</code> 屏幕构建并测试。配备 {outros} 的机器需要另外构建 —— 屏幕没有 EDID，系统无法自动识别。",
    "note.compat": "也适用于部分 {lista} 及同系变体（同一主板）。",
  },

  hi: {
    "meta.title": "Giochi OS — डाउनलोड",
    "meta.description":
      "हर समर्थित डिवाइस के लिए Giochi OS इमेज। साफ़ Linux सिस्टम; ऐप्स स्टोर से इंस्टॉल होते हैं।",
    "meta.ogDescription": "हर डिवाइस के लिए कार्ड पर लिखने को तैयार इमेज। सिस्टम साफ़ Linux है; ऐप्स इमेज से बाहर रहते हैं।",

    "nav.language": "भाषा",
    "nav.download": "डाउनलोड",
    "nav.install": "इंस्टॉल",
    "nav.devices": "डिवाइस",
    "nav.project": "प्रोजेक्ट",
    "nav.checksum": "चेकसम जाँचें",
    "nav.sdCard": "SD कार्ड",
    "nav.qemu": "वर्चुअल मशीन (QEMU)",
    "nav.deviceList": "सूची और आवश्यकताएँ",
    "nav.about": "यह कैसे बनता है",
    "nav.repos": "रिपॉज़िटरी",
    "nav.license": "लाइसेंस",
    "nav.noJs": "भाषा बदलने के लिए JavaScript चाहिए। यह पेज अंग्रेज़ी में है।",

    "hero.eyebrow": "हैंडहेल्ड कंसोल · ARM64",
    "hero.title": "सिस्टम और ऐप्स, एक ही जगह।",
    "hero.lede":
      "Giochi OS वह साफ़ Linux आधार है जो Buildroot से बनता है और कार्ड के लिए तैयार इमेज के रूप में आता है। बिना हार्डवेयर QEMU में आज़माने के लिए वर्चुअल मशीन इमेज भी है। ऐप्स इमेज से बाहर रहते हैं: आप उन्हें स्टोर से लिखने योग्य पार्टीशन पर इंस्टॉल करते हैं और जब चाहें बदल सकते हैं।",
    "hero.cta.download": "इमेज देखें",
    "hero.cta.devices": "समर्थित डिवाइस",
    "hero.count": "{n} रिलीज़ प्रकाशित · {data} को बनाया गया",

    "downloads.title": "हर डिवाइस के लिए इमेज",
    "downloads.lede":
      "हर इमेज उसी हार्डवेयर के लिए है: कर्नेल, डिवाइस ट्री, पैनल ड्राइवर और पार्टीशन लेआउट डिवाइस के होते हैं, सामान्य नहीं। वर्चुअल मशीन वाली इमेज के कार्ड में QEMU कमांड मौजूद रहता है।",

    "card.size": "आकार",
    "card.buildroot": "Buildroot",
    "card.appsImage": "इमेज में ऐप्स",
    "card.appsStore": "स्टोर में ऐप्स",
    "card.kernel": "कर्नेल",
    "card.showApps": "{n} ऐप्स देखें",
    "card.unavailable": "इमेज उपलब्ध नहीं",
    "card.downloadCard": "इमेज डाउनलोड करें ({size})",
    "card.downloadDisk": "डिस्क डाउनलोड करें ({size})",
    "card.kernelButton": "कर्नेल ({size})",
    "card.checksum": "चेकसम",
    "card.instructions": "निर्देश",
    "card.kindCard": "SD कार्ड",
    "card.kindVirtual": "वर्चुअल मशीन",
    "card.hintTitle": "यह डाउनलोड संपीड़ित है। <strong>लिखने से पहले खोलें</strong> — <code>dd</code> कच्चे बाइट कॉपी करता है:",
    "card.runSummary": "QEMU में कैसे शुरू करें",
    "card.runFirst": "पहले खोलें:",
    "card.runNotes":
      "लॉगिन <code>root</code>, पासवर्ड <code>giochi-system</code>. कंसोल छोड़ने के लिए: <code>Ctrl+A</code>, फिर <code>X</code>. यह इमेज हेडलेस है: कंसोल ही इंटरफ़ेस है। ऐप्स <code>/opt/giochi/apps</code> में हैं — लॉन्चर <code>SDL_VIDEODRIVER=dummy</code> के साथ चलाएँ।",

    "verify.title": "चेकसम जाँचें",
    "verify.lede":
      "हर डिवाइस का अपना चेकसम फ़ाइल है और वह उस डिवाइस की <strong>हर</strong> फ़ाइल को कवर करता है — इमेज, कर्नेल और जो कुछ भी प्रकाशित हो। अगर कोई पंक्ति मेल न खाए, डाउनलोड खराब है: लिखने से पहले फिर से डाउनलोड करें।",
    "verify.place":
      "<code>&lt;device&gt;</code> की जगह अपने डिवाइस की id रखें। जो भी पंक्ति <code>OK</code> न कहे, वह फ़ाइल काम की नहीं।",
    "verify.step1": "डिवाइस का चेकसम डाउनलोड करें",
    "verify.step2": "फ़ाइलों वाले फ़ोल्डर में चलाएँ",
    "verify.step3": "पूरे निर्देश",
    "verify.step3note":
      "हर डिवाइस <code>&lt;device&gt;-README.txt</code> भी प्रकाशित करता है, जिसमें उस फ़ाइल के लिए कदम-दर-कदम निर्देश हैं — कार्ड पर लिखें या वर्चुअल मशीन में शुरू करें।",

    "write.title": "SD कार्ड पर लिखें",
    "write.lede":
      "सिर्फ़ <strong>SD कार्ड</strong> इमेज के लिए। <strong>वर्चुअल मशीन</strong> वाली कार्ड पर नहीं जातीं: उन्हें खोलें और डिवाइस कार्ड में दिया कमांड चलाएँ।",
    "write.step1": "खोलें",
    "write.step1note":
      "<code>dd</code> कच्चे बाइट लिखता है। <code>.xz</code> पर इंगित करने से संपीड़ित फ़ाइल कार्ड पर चली जाएगी और डिवाइस बूट नहीं होगा। Zstd: <code>zstd -d</code>; gzip: <code>gunzip -k</code>।",
    "write.step2": "डिवाइस पहचानें",
    "write.step2note":
      "कार्ड आमतौर पर <code>/dev/sdX</code> या <code>/dev/mmcblkX</code> होता है। आकार जाँचें: 32 GB का कार्ड लगभग 29 GB दिखता है।",
    "write.step3": "लिखें",
    "write.step3note":
      "<strong>कार्ड पूरी तरह मिट जाएगा।</strong> <code>conv=fsync</code> वैकल्पिक नहीं है — इसके बिना लिखना अधूरा रह सकता है।",
    "write.step4": "नतीजा जाँचें",
    "write.step4note":
      "पार्टीशन नंबर डिवाइस के लेआउट से बदलता है — आपके डिवाइस का <code>README.txt</code> बताता है कौन सा। यहाँ फ़ाइलसिस्टम त्रुटि का मतलब है खराब कार्ड या रुका हुआ लेखन।",

    "qemu.title": "वर्चुअल मशीन में चलाएँ",
    "qemu.lede":
      "सिस्टम जानने और बिना हार्डवेयर जाँचने के लिए। यह वह डिवाइस नहीं है: GPU के बिना 3D गेम नहीं खुलते और सीरियल कंसोल ही इंटरफ़ेस है।",
    "qemu.empty": "अभी कोई वर्चुअल मशीन इमेज प्रकाशित नहीं है। जब होगी, सही कमांड यहाँ और उसके कार्ड में दिखेगा।",

    "devices.title": "समर्थित डिवाइस",
    "devices.lede":
      "अभी जो प्रकाशित है। कोई डिवाइस इस सूची में तब आता है जब उसके लिए इमेज बन चुकी हो और जाँची जा चुकी हो — यह सूची रिलीज़ से आती है, किसी रोडमैप का वादा नहीं।",
    "devices.thDevice": "डिवाइस",
    "devices.thId": "आईडी",
    "devices.thArch": "आर्किटेक्चर",
    "devices.thType": "प्रकार",
    "devices.thVersion": "संस्करण",
    "devices.thSize": "आकार",
    "devices.thApps": "ऐप्स",
    "devices.note":
      "<strong>प्रकार</strong> बताता है फ़ाइल किसलिए है: <em>SD कार्ड</em> डिवाइस पर लिखने के लिए; <em>वर्चुअल मशीन</em> QEMU डिस्क है, और उसे कार्ड पर लिखने से बूट होने वाला डिवाइस नहीं बनता।",

    "about.title": "यह कैसे बनता है",
    "about.systemTitle": "Giochi System",
    "about.systemText":
      "Buildroot से साफ़ Linux बनाता है: हर डिवाइस के लिए कर्नेल, rootfs, बूट, ड्राइवर और पैनल। यहाँ कोई इंटरफ़ेस नहीं।",
    "about.appTitle": "Giochi app",
    "about.appText": "ऐप्स, हर एक अपनी आवश्यकता-सूची के साथ। इंस्टॉल से पहले सिस्टम सूची की तुलना डिवाइस प्रोफ़ाइल से करता है।",
    "about.gamesTitle": "Giochi games",
    "about.gamesText": "गेम, उसी सूची के साथ। जब वितरण <code>image</code> हो तो वे इमेज में जाते हैं; वरना स्टोर में रहते हैं।",
    "about.osTitle": "Giochi OS",
    "about.osText":
      "तीनों को जोड़ता है: इमेज वाले ऐप्स rootfs में डालता है, इमेज के अंदर नतीजा जाँचता है और चेकसम के साथ प्रकाशित करता है। यही यह पेज है।",
    "about.noteTitle": "ऐप्स इमेज से बाहर क्यों",
    "about.noteText":
      "रूट हस्ताक्षरित और केवल-पढ़ने योग्य है। <code>/user</code> में इंस्टॉल ऐप्स उपयोगकर्ता बदल सकता है — बदला हुआ संस्करण भी, और GPL सॉफ़्टवेयर के लिए GPL यही माँगता है। इसलिए स्टोर कंप्यूटर पर चलता है और तैयार पैकेज भेजता है, सब कुछ इमेज में डालने के बजाय।",

    "repos.title": "रिपॉज़िटरी",
    "repos.lede": "अलग-अलग रिपॉज़िटरी। एक से दूसरे में कुछ आयात नहीं होता: रास्ता आर्ग्युमेंट के रूप में आता है और एकमात्र जुड़ाव JSON अनुबंध है।",
    "repos.system": "हर डिवाइस के लिए साफ़ Linux",
    "repos.app": "ऐप्स और स्टोर",
    "repos.games": "गेम",
    "repos.os": "यह रिपॉज़िटरी: जोड़ती और प्रकाशित करती है",
    "repos.all": "सभी रिलीज़",

    "license.title": "लाइसेंस",
    "license.systemTitle": "सिस्टम",
    "license.systemText":
      "Giochi System MIT लाइसेंस के अंतर्गत है। Buildroot और कर्नेल के घटक अपने मूल लाइसेंस रखते हैं; हर एक का पाठ इमेज के अंदर <code>/usr/share/licenses</code> में है।",
    "license.appsTitle": "ऐप्स और गेम",
    "license.appsText":
      "स्वामित्व लाइसेंस, हर ऐप की सूची में घोषित। इमेज से असंगत लाइसेंस वाला ऐप पैकेजिंग में अस्वीकार होता है — जाँच यहाँ है, किसी दूसरी रिपॉज़िटरी के पहले चलने पर निर्भर नहीं।",
    "license.note": "मुक्त सॉफ़्टवेयर, कोई वारंटी नहीं। इमेज लिखने से कार्ड मिट जाता है — पहले डिवाइस जाँचें।",

    "foot.line": "Giochi OS · सिस्टम MIT लाइसेंस के अंतर्गत · अपने ऐप्स स्वामित्व लाइसेंस के अंतर्गत",
    "foot.code": "कोड",
    "foot.releases": "रिलीज़",
    "foot.docs": "तकनीकी दस्तावेज़",
    "note.title": "ध्यान दें",
    "note.painel": "<code>{modelo}</code> स्क्रीन के साथ बनाया और जाँचा गया। {outros} वाली इकाइयों के लिए दूसरी बिल्ड चाहिए — पैनल में EDID नहीं होता, इसलिए सिस्टम उसे पहचान नहीं सकता।",
    "note.compat": "{lista} की कुछ इकाइयों और उनके वेरिएंट पर भी चलता है (एक ही बोर्ड)।",
  },

  es: {
    "meta.title": "Giochi OS — descargar",
    "meta.description":
      "Imágenes de Giochi OS para cada dispositivo compatible. Un sistema Linux limpio; las apps se instalan desde la tienda.",
    "meta.ogDescription": "Una imagen lista para la tarjeta, por dispositivo. El sistema es Linux limpio; las apps viven fuera de la imagen.",

    "nav.language": "Idioma",
    "nav.download": "Descargar",
    "nav.install": "Instalar",
    "nav.devices": "Dispositivos",
    "nav.project": "Proyecto",
    "nav.checksum": "Comprobar el checksum",
    "nav.sdCard": "Tarjeta SD",
    "nav.qemu": "Máquina virtual (QEMU)",
    "nav.deviceList": "Lista y requisitos",
    "nav.about": "Cómo se hace",
    "nav.repos": "Repositorios",
    "nav.license": "Licencias",
    "nav.noJs": "El selector de idioma necesita JavaScript. Esta página está en inglés.",

    "hero.eyebrow": "Consola portátil · ARM64",
    "hero.title": "El sistema y las apps, en el mismo lugar.",
    "hero.lede":
      "Giochi OS es la base Linux limpia construida con Buildroot, entregada como imagen lista para la tarjeta. También hay imagen de máquina virtual, para probarlo en QEMU sin hardware. Las apps viven fuera de la imagen: las instalas desde la tienda, en la partición escribible, y puedes reemplazarlas cuando quieras.",
    "hero.cta.download": "Ver imágenes",
    "hero.cta.devices": "Dispositivos compatibles",
    "hero.count": "{n} versión(es) publicada(s) · generado el {data}",

    "downloads.title": "Imágenes por dispositivo",
    "downloads.lede":
      "Cada imagen es específica del hardware: kernel, device tree, driver del panel y diseño de particiones son del dispositivo, no genéricos. Las de máquina virtual llevan el comando de QEMU en la propia tarjeta.",

    "card.size": "Tamaño",
    "card.buildroot": "Buildroot",
    "card.appsImage": "Apps en la imagen",
    "card.appsStore": "Apps en la tienda",
    "card.kernel": "Kernel",
    "card.showApps": "Ver las {n} app(s)",
    "card.unavailable": "imagen no disponible",
    "card.downloadCard": "Descargar imagen ({size})",
    "card.downloadDisk": "Descargar disco ({size})",
    "card.kernelButton": "Kernel ({size})",
    "card.checksum": "Checksum",
    "card.instructions": "Instrucciones",
    "card.kindCard": "Tarjeta SD",
    "card.kindVirtual": "Máquina virtual",
    "card.hintTitle": "Esta descarga está comprimida. <strong>Descomprime antes de escribir</strong> — <code>dd</code> copia bytes crudos:",
    "card.runSummary": "Cómo iniciar en QEMU",
    "card.runFirst": "Descomprime primero:",
    "card.runNotes":
      "Usuario <code>root</code>, contraseña <code>giochi-system</code>. Para salir de la consola: <code>Ctrl+A</code>, luego <code>X</code>. Esta imagen es headless: la consola es la interfaz. Las apps están en <code>/opt/giochi/apps</code> — ejecuta el launcher con <code>SDL_VIDEODRIVER=dummy</code>.",

    "verify.title": "Comprobar el checksum",
    "verify.lede":
      "Cada dispositivo tiene su propio archivo de checksums, y cubre <strong>todos</strong> los archivos de ese dispositivo — imagen, kernel y lo demás publicado. Si alguna línea no coincide, la descarga está corrupta: descárgala de nuevo antes de escribir.",
    "verify.place":
      "Cambia <code>&lt;device&gt;</code> por el id de tu dispositivo. Toda línea que no diga <code>OK</code> es un archivo que no sirve.",
    "verify.step1": "Descarga el checksum del dispositivo",
    "verify.step2": "Ejecútalo en la misma carpeta de los archivos",
    "verify.step3": "Instrucciones completas",
    "verify.step3note":
      "Cada dispositivo publica también un <code>&lt;device&gt;-README.txt</code> con el paso a paso de ese archivo — escribir en la tarjeta o iniciar en la máquina virtual.",

    "write.title": "Escribir en la tarjeta SD",
    "write.lede":
      "Solo para las imágenes de <strong>tarjeta SD</strong>. Las de <strong>máquina virtual</strong> no van a la tarjeta: descomprímelas y ejecuta el comando de la tarjeta del dispositivo.",
    "write.step1": "Descomprime",
    "write.step1note":
      "<code>dd</code> escribe bytes crudos. Apuntarlo al <code>.xz</code> escribiría el archivo comprimido en la tarjeta y el dispositivo no arrancaría. Zstd: <code>zstd -d</code>; gzip: <code>gunzip -k</code>.",
    "write.step2": "Encuentra el dispositivo",
    "write.step2note":
      "La tarjeta suele ser <code>/dev/sdX</code> o <code>/dev/mmcblkX</code>. Comprueba el tamaño: una tarjeta de 32 GB aparece con unos 29 GB.",
    "write.step3": "Escribe",
    "write.step3note":
      "<strong>La tarjeta se borrará por completo.</strong> <code>conv=fsync</code> no es opcional — sin él la escritura puede quedar truncada.",
    "write.step4": "Comprueba el resultado",
    "write.step4note":
      "El número de partición cambia con el diseño del dispositivo — el <code>README.txt</code> de tu dispositivo dice cuál. Un error de filesystem aquí significa tarjeta mala o escritura interrumpida.",

    "qemu.title": "Ejecutar en una máquina virtual",
    "qemu.lede":
      "Sirve para conocer el sistema y probar sin hardware. No es el dispositivo: sin GPU los juegos 3D no abren, y la consola serie es la interfaz.",
    "qemu.empty": "No hay ninguna imagen de máquina virtual publicada ahora. Cuando la haya, el comando exacto aparecerá aquí y en su tarjeta.",

    "devices.title": "Dispositivos compatibles",
    "devices.lede":
      "Lo que está publicado ahora. Un dispositivo entra en esta lista cuando hay una imagen construida y verificada para él — la lista es la de las versiones, no una promesa de roadmap.",
    "devices.thDevice": "Dispositivo",
    "devices.thId": "Id",
    "devices.thArch": "Arquitectura",
    "devices.thType": "Tipo",
    "devices.thVersion": "Versión",
    "devices.thSize": "Tamaño",
    "devices.thApps": "Apps",
    "devices.note":
      "<strong>Tipo</strong> dice el destino del archivo: <em>Tarjeta SD</em> es para escribir en el dispositivo; <em>Máquina virtual</em> es un disco de QEMU, y escribirlo en una tarjeta no produce un dispositivo que arranque.",

    "about.title": "Cómo se hace",
    "about.systemTitle": "Giochi System",
    "about.systemText":
      "Construye el Linux limpio con Buildroot: kernel, rootfs, arranque, drivers y panel de cada dispositivo. Ninguna interfaz aquí.",
    "about.appTitle": "Giochi app",
    "about.appText":
      "Las apps, cada una con su manifiesto de requisitos. El sistema compara el manifiesto con el perfil del dispositivo antes de instalar.",
    "about.gamesTitle": "Giochi games",
    "about.gamesText":
      "Los juegos, con el mismo manifiesto. Entran en la imagen cuando su distribución es <code>image</code>; si no, se quedan en la tienda.",
    "about.osTitle": "Giochi OS",
    "about.osText":
      "Junta los tres: embebe las apps de imagen en el rootfs, comprueba el resultado dentro de la imagen y publica con checksum. Esta página.",
    "about.noteTitle": "Por qué las apps viven fuera de la imagen",
    "about.noteText":
      "La raíz está firmada y es de solo lectura. Las apps instaladas en <code>/user</code> pueden ser reemplazadas por el usuario — incluso por una versión modificada, que es lo que la GPL exige del software GPL. Por eso la tienda corre en el ordenador y envía el paquete listo, en vez de embeber todo en la imagen.",

    "repos.title": "Repositorios",
    "repos.lede":
      "Repositorios independientes. Nada se importa de uno a otro: la ruta entra como argumento y el único acoplamiento es el contrato en JSON.",
    "repos.system": "el Linux limpio de cada dispositivo",
    "repos.app": "las apps y la tienda",
    "repos.games": "los juegos",
    "repos.os": "este repositorio: junta y publica",
    "repos.all": "Todas las versiones",

    "license.title": "Licencias",
    "license.systemTitle": "Sistema",
    "license.systemText":
      "Giochi System bajo licencia MIT. Los componentes de Buildroot y del kernel mantienen sus licencias originales; el texto de cada una está dentro de la imagen, en <code>/usr/share/licenses</code>.",
    "license.appsTitle": "Apps y juegos",
    "license.appsText":
      "Licencia propietaria, declarada en el manifiesto de cada app. Una app con licencia incompatible con la imagen se rechaza al empaquetar — la comprobación está aquí, no depende de que otro repositorio haya corrido antes.",
    "license.note": "Software libre, sin garantía. Escribir una imagen borra la tarjeta — comprueba el dispositivo antes.",

    "foot.line": "Giochi OS · sistema bajo licencia MIT · apps propias bajo licencia propietaria",
    "foot.code": "código",
    "foot.releases": "versiones",
    "foot.docs": "documentación técnica",
    "note.title": "Observaciones",
    "note.painel": "Construida y probada con la pantalla <code>{modelo}</code>. Las unidades con {outros} necesitan otra compilación — el panel no tiene EDID, así que el sistema no puede detectarlo.",
    "note.compat": "También funciona en algunas unidades del {lista} y variantes (misma placa).",
  },

  fr: {
    "meta.title": "Giochi OS — télécharger",
    "meta.description":
      "Images de Giochi OS pour chaque appareil pris en charge. Un système Linux propre ; les applis s'installent depuis le magasin.",
    "meta.ogDescription": "Une image prête pour la carte, par appareil. Le système est un Linux propre ; les applis vivent hors de l'image.",

    "nav.language": "Langue",
    "nav.download": "Télécharger",
    "nav.install": "Installer",
    "nav.devices": "Appareils",
    "nav.project": "Projet",
    "nav.checksum": "Vérifier le checksum",
    "nav.sdCard": "Carte SD",
    "nav.qemu": "Machine virtuelle (QEMU)",
    "nav.deviceList": "Liste et prérequis",
    "nav.about": "Comment c'est fait",
    "nav.repos": "Dépôts",
    "nav.license": "Licences",
    "nav.noJs": "Le sélecteur de langue nécessite JavaScript. Cette page est en anglais.",

    "hero.eyebrow": "Console portable · ARM64",
    "hero.title": "Le système et les applis, au même endroit.",
    "hero.lede":
      "Giochi OS est la base Linux propre construite avec Buildroot, livrée en image prête pour la carte. Il existe aussi une image de machine virtuelle, pour l'essayer dans QEMU sans matériel. Les applis vivent hors de l'image : vous les installez depuis le magasin, sur la partition inscriptible, et vous pouvez les remplacer quand vous voulez.",
    "hero.cta.download": "Voir les images",
    "hero.cta.devices": "Appareils pris en charge",
    "hero.count": "{n} version(s) publiée(s) · généré le {data}",

    "downloads.title": "Images par appareil",
    "downloads.lede":
      "Chaque image est propre au matériel : noyau, device tree, pilote d'écran et découpage des partitions appartiennent à l'appareil, ils ne sont pas génériques. Celles de machine virtuelle portent la commande QEMU dans la carte elle-même.",

    "card.size": "Taille",
    "card.buildroot": "Buildroot",
    "card.appsImage": "Applis dans l'image",
    "card.appsStore": "Applis dans le magasin",
    "card.kernel": "Noyau",
    "card.showApps": "Voir les {n} applis",
    "card.unavailable": "image indisponible",
    "card.downloadCard": "Télécharger l'image ({size})",
    "card.downloadDisk": "Télécharger le disque ({size})",
    "card.kernelButton": "Noyau ({size})",
    "card.checksum": "Checksum",
    "card.instructions": "Instructions",
    "card.kindCard": "Carte SD",
    "card.kindVirtual": "Machine virtuelle",
    "card.hintTitle": "Ce téléchargement est compressé. <strong>Décompressez avant d'écrire</strong> — <code>dd</code> copie des octets bruts :",
    "card.runSummary": "Comment démarrer dans QEMU",
    "card.runFirst": "Décompressez d'abord :",
    "card.runNotes":
      "Identifiant <code>root</code>, mot de passe <code>giochi-system</code>. Pour quitter la console : <code>Ctrl+A</code>, puis <code>X</code>. Cette image est headless : la console est l'interface. Les applis sont dans <code>/opt/giochi/apps</code> — lancez le launcher avec <code>SDL_VIDEODRIVER=dummy</code>.",

    "verify.title": "Vérifier le checksum",
    "verify.lede":
      "Chaque appareil a son propre fichier de checksums, et il couvre <strong>tous</strong> les fichiers de cet appareil — image, noyau et le reste de ce qui est publié. Si une ligne ne correspond pas, le téléchargement est corrompu : téléchargez-le à nouveau avant d'écrire.",
    "verify.place":
      "Remplacez <code>&lt;device&gt;</code> par l'id de votre appareil. Toute ligne qui n'affiche pas <code>OK</code> est un fichier inutilisable.",
    "verify.step1": "Téléchargez le checksum de l'appareil",
    "verify.step2": "Exécutez-le dans le dossier des fichiers",
    "verify.step3": "Instructions complètes",
    "verify.step3note":
      "Chaque appareil publie aussi un <code>&lt;device&gt;-README.txt</code> avec le pas à pas de ce fichier — écrire sur la carte ou démarrer dans la machine virtuelle.",

    "write.title": "Écrire sur la carte SD",
    "write.lede":
      "Uniquement pour les images de <strong>carte SD</strong>. Celles de <strong>machine virtuelle</strong> ne vont pas sur une carte : décompressez-les et lancez la commande de la carte de l'appareil.",
    "write.step1": "Décompressez",
    "write.step1note":
      "<code>dd</code> écrit des octets bruts. Le pointer sur le <code>.xz</code> écrirait le fichier compressé sur la carte et l'appareil ne démarrerait pas. Zstd : <code>zstd -d</code> ; gzip : <code>gunzip -k</code>.",
    "write.step2": "Trouvez l'appareil",
    "write.step2note":
      "La carte est souvent <code>/dev/sdX</code> ou <code>/dev/mmcblkX</code>. Vérifiez la taille : une carte de 32 Go apparaît avec environ 29 Go.",
    "write.step3": "Écrivez",
    "write.step3note":
      "<strong>La carte sera entièrement effacée.</strong> <code>conv=fsync</code> n'est pas optionnel — sans lui l'écriture peut être tronquée.",
    "write.step4": "Vérifiez le résultat",
    "write.step4note":
      "Le numéro de partition change avec le découpage de l'appareil — le <code>README.txt</code> de votre appareil indique lequel. Une erreur de système de fichiers ici signifie carte défectueuse ou écriture interrompue.",

    "qemu.title": "Lancer dans une machine virtuelle",
    "qemu.lede":
      "Utile pour découvrir le système et tester sans matériel. Ce n'est pas l'appareil : sans GPU les jeux 3D ne s'ouvrent pas, et la console série est l'interface.",
    "qemu.empty": "Aucune image de machine virtuelle publiée pour l'instant. Dès qu'il y en aura une, la commande exacte apparaîtra ici et dans sa carte.",

    "devices.title": "Appareils pris en charge",
    "devices.lede":
      "Ce qui est publié maintenant. Un appareil entre dans cette liste quand une image est construite et vérifiée pour lui — la liste est celle des versions, pas une promesse de feuille de route.",
    "devices.thDevice": "Appareil",
    "devices.thId": "Id",
    "devices.thArch": "Architecture",
    "devices.thType": "Type",
    "devices.thVersion": "Version",
    "devices.thSize": "Taille",
    "devices.thApps": "Applis",
    "devices.note":
      "<strong>Type</strong> indique la destination du fichier : <em>Carte SD</em> sert à écrire sur l'appareil ; <em>Machine virtuelle</em> est un disque QEMU, et l'écrire sur une carte ne donne pas un appareil qui démarre.",

    "about.title": "Comment c'est fait",
    "about.systemTitle": "Giochi System",
    "about.systemText":
      "Construit le Linux propre avec Buildroot : noyau, rootfs, démarrage, pilotes et écran de chaque appareil. Aucune interface ici.",
    "about.appTitle": "Giochi app",
    "about.appText":
      "Les applis, chacune avec son manifeste de prérequis. Le système compare le manifeste au profil de l'appareil avant d'installer.",
    "about.gamesTitle": "Giochi games",
    "about.gamesText":
      "Les jeux, avec le même manifeste. Ils entrent dans l'image quand leur distribution est <code>image</code> ; sinon ils restent dans le magasin.",
    "about.osTitle": "Giochi OS",
    "about.osText":
      "Réunit les trois : intègre les applis d'image dans le rootfs, vérifie le résultat à l'intérieur de l'image et publie avec checksum. Cette page.",
    "about.noteTitle": "Pourquoi les applis vivent hors de l'image",
    "about.noteText":
      "La racine est signée et en lecture seule. Les applis installées dans <code>/user</code> peuvent être remplacées par l'utilisateur — y compris par une version modifiée, ce que la GPL exige des logiciels GPL. C'est pourquoi le magasin tourne sur l'ordinateur et envoie le paquet prêt, au lieu de tout intégrer à l'image.",

    "repos.title": "Dépôts",
    "repos.lede":
      "Dépôts indépendants. Rien n'est importé de l'un vers l'autre : le chemin arrive en argument et le seul couplage est le contrat JSON.",
    "repos.system": "le Linux propre de chaque appareil",
    "repos.app": "les applis et le magasin",
    "repos.games": "les jeux",
    "repos.os": "ce dépôt : réunit et publie",
    "repos.all": "Toutes les versions",

    "license.title": "Licences",
    "license.systemTitle": "Système",
    "license.systemText":
      "Giochi System sous licence MIT. Les composants de Buildroot et du noyau gardent leurs licences d'origine ; le texte de chacune est dans l'image, sous <code>/usr/share/licenses</code>.",
    "license.appsTitle": "Applis et jeux",
    "license.appsText":
      "Licence propriétaire, déclarée dans le manifeste de chaque appli. Une appli dont la licence est incompatible avec l'image est refusée à l'empaquetage — la vérification est ici, elle ne dépend pas d'un autre dépôt exécuté avant.",
    "license.note": "Logiciel libre, sans garantie. Écrire une image efface la carte — vérifiez l'appareil avant.",

    "foot.line": "Giochi OS · système sous licence MIT · applis propres sous licence propriétaire",
    "foot.code": "code",
    "foot.releases": "versions",
    "foot.docs": "documentation technique",
    "note.title": "Remarques",
    "note.painel": "Construite et testée avec l'écran <code>{modelo}</code>. Les unités avec {outros} nécessitent une autre compilation — le panneau n'a pas d'EDID, le système ne peut donc pas le détecter.",
    "note.compat": "Fonctionne aussi sur certaines unités du {lista} et variantes (même carte).",
  },

  ar: {
    "meta.title": "Giochi OS — تنزيل",
    "meta.description":
      "صور Giochi OS لكل جهاز مدعوم. نظام Linux نظيف؛ تُثبَّت التطبيقات من المتجر.",
    "meta.ogDescription": "صورة جاهزة للبطاقة، لكل جهاز. النظام Linux نظيف؛ التطبيقات خارج الصورة.",

    "nav.language": "اللغة",
    "nav.download": "تنزيل",
    "nav.install": "تثبيت",
    "nav.devices": "الأجهزة",
    "nav.project": "المشروع",
    "nav.checksum": "تحقّق من البصمة",
    "nav.sdCard": "بطاقة SD",
    "nav.qemu": "جهاز افتراضي (QEMU)",
    "nav.deviceList": "القائمة والمتطلبات",
    "nav.about": "كيف يُصنع",
    "nav.repos": "المستودعات",
    "nav.license": "الرخص",
    "nav.noJs": "مبدّل اللغة يحتاج إلى JavaScript. هذه الصفحة بالإنجليزية.",

    "hero.eyebrow": "منصّة محمولة · ARM64",
    "hero.title": "النظام والتطبيقات في مكان واحد.",
    "hero.lede":
      "‏Giochi OS هو أساس Linux النظيف المبني بـ Buildroot، يُسلَّم كصورة جاهزة للبطاقة. وهناك أيضًا صورة جهاز افتراضي لتجربته في QEMU دون عتاد. التطبيقات خارج الصورة: تُثبّتها من المتجر على القسم القابل للكتابة، ويمكنك استبدالها وقتما تريد.",
    "hero.cta.download": "عرض الصور",
    "hero.cta.devices": "الأجهزة المدعومة",
    "hero.count": "{n} إصدار منشور · أُنشئت في {data}",

    "downloads.title": "الصور حسب الجهاز",
    "downloads.lede":
      "كل صورة خاصة بالعتاد: النواة وشجرة الجهاز وتعريف الشاشة وتقسيم الأقسام تخصّ الجهاز وليست عامة. صور الجهاز الافتراضي تحمل أمر QEMU في بطاقتها.",

    "card.size": "الحجم",
    "card.buildroot": "Buildroot",
    "card.appsImage": "تطبيقات في الصورة",
    "card.appsStore": "تطبيقات في المتجر",
    "card.kernel": "النواة",
    "card.showApps": "عرض {n} تطبيقًا",
    "card.unavailable": "الصورة غير متاحة",
    "card.downloadCard": "تنزيل الصورة ({size})",
    "card.downloadDisk": "تنزيل القرص ({size})",
    "card.kernelButton": "النواة ({size})",
    "card.checksum": "البصمة",
    "card.instructions": "التعليمات",
    "card.kindCard": "بطاقة SD",
    "card.kindVirtual": "جهاز افتراضي",
    "card.hintTitle": "هذا التنزيل مضغوط. <strong>فُكّ الضغط قبل الكتابة</strong> — <code>dd</code> ينسخ بايتات خام:",
    "card.runSummary": "كيف تبدأ في QEMU",
    "card.runFirst": "فُكّ الضغط أولًا:",
    "card.runNotes":
      "الدخول <code>root</code>، كلمة المرور <code>giochi-system</code>. للخروج من الطرفية: <code>Ctrl+A</code> ثم <code>X</code>. هذه الصورة بلا واجهة رسومية: الطرفية هي الواجهة. التطبيقات في <code>/opt/giochi/apps</code> — شغّل المشغّل بـ <code>SDL_VIDEODRIVER=dummy</code>.",

    "verify.title": "تحقّق من البصمة",
    "verify.lede":
      "لكل جهاز ملف بصمات خاص به، ويغطي <strong>كل</strong> ملفات ذلك الجهاز — الصورة والنواة وما يُنشر غيرهما. إذا لم يتطابق سطر واحد فالتنزيل تالف: نزّله مرة أخرى قبل الكتابة.",
    "verify.place":
      "استبدل <code>&lt;device&gt;</code> بمعرّف جهازك. كل سطر لا يقول <code>OK</code> هو ملف غير صالح.",
    "verify.step1": "نزّل بصمة الجهاز",
    "verify.step2": "شغّلها في مجلد الملفات نفسه",
    "verify.step3": "التعليمات الكاملة",
    "verify.step3note":
      "كل جهاز ينشر أيضًا <code>&lt;device&gt;-README.txt</code> بخطوات ذلك الملف — الكتابة على البطاقة أو التشغيل في الجهاز الافتراضي.",

    "write.title": "الكتابة على بطاقة SD",
    "write.lede":
      "لصور <strong>بطاقة SD</strong> فقط. صور <strong>الجهاز الافتراضي</strong> لا تُوضع على بطاقة: فُكّ ضغطها وشغّل الأمر الموجود في بطاقة الجهاز.",
    "write.step1": "فُكّ الضغط",
    "write.step1note":
      "<code>dd</code> يكتب بايتات خام. توجيهه إلى <code>.xz</code> سيكتب الملف المضغوط على البطاقة ولن يُقلع الجهاز. Zstd: <code>zstd -d</code>؛ gzip: <code>gunzip -k</code>.",
    "write.step2": "حدّد الجهاز",
    "write.step2note":
      "البطاقة عادةً <code>/dev/sdX</code> أو <code>/dev/mmcblkX</code>. تحقّق من الحجم: بطاقة 32 غيغابايت تظهر بنحو 29 غيغابايت.",
    "write.step3": "اكتب",
    "write.step3note":
      "<strong>ستُمحى البطاقة بالكامل.</strong> <code>conv=fsync</code> ليس اختياريًا — بدونه قد تُقتطع الكتابة.",
    "write.step4": "تحقّق من النتيجة",
    "write.step4note":
      "رقم القسم يتغيّر حسب تقسيم الجهاز — و<code>README.txt</code> لجهازك يحدّده. خطأ في نظام الملفات هنا يعني بطاقة تالفة أو كتابة متوقفة.",

    "qemu.title": "التشغيل في جهاز افتراضي",
    "qemu.lede":
      "مفيد لمعرفة النظام والاختبار دون عتاد. ليس الجهاز نفسه: بدون GPU لا تُفتح الألعاب ثلاثية الأبعاد، والطرفية التسلسلية هي الواجهة.",
    "qemu.empty": "لا توجد صورة جهاز افتراضي منشورة الآن. عندما توجد، سيظهر الأمر الدقيق هنا وفي بطاقتها.",

    "devices.title": "الأجهزة المدعومة",
    "devices.lede":
      "ما هو منشور الآن. يدخل الجهاز هذه القائمة عندما توجد صورة مبنية ومتحقَّق منها له — القائمة هي قائمة الإصدارات، وليست وعدًا بخطة.",
    "devices.thDevice": "الجهاز",
    "devices.thId": "المعرّف",
    "devices.thArch": "المعمارية",
    "devices.thType": "النوع",
    "devices.thVersion": "الإصدار",
    "devices.thSize": "الحجم",
    "devices.thApps": "التطبيقات",
    "devices.note":
      "<strong>النوع</strong> يحدّد مصير الملف: <em>بطاقة SD</em> للكتابة على الجهاز؛ <em>جهاز افتراضي</em> قرص QEMU، وكتابته على بطاقة لا تُنتج جهازًا يُقلع.",

    "about.title": "كيف يُصنع",
    "about.systemTitle": "Giochi System",
    "about.systemText": "يبني Linux النظيف بـ Buildroot: النواة وrootfs والإقلاع والتعريفات والشاشة لكل جهاز. لا واجهة هنا.",
    "about.appTitle": "Giochi app",
    "about.appText": "التطبيقات، كل واحد ببيان متطلباته. يقارن النظام البيان بملف الجهاز قبل التثبيت.",
    "about.gamesTitle": "Giochi games",
    "about.gamesText": "الألعاب، بالبيان نفسه. تدخل الصورة عندما يكون توزيعها <code>image</code>؛ وإلا تبقى في المتجر.",
    "about.osTitle": "Giochi OS",
    "about.osText":
      "يجمع الثلاثة: يُضمّن تطبيقات الصورة في rootfs، ويتحقّق من النتيجة داخل الصورة، وينشر ببصمة. هذه الصفحة.",
    "about.noteTitle": "لماذا التطبيقات خارج الصورة",
    "about.noteText":
      "الجذر موقَّع وللقراءة فقط. يمكن للمستخدم استبدال التطبيقات المثبَّتة في <code>/user</code> — بما في ذلك نسخة معدَّلة، وهو ما تشترطه GPL على برمجيات GPL. لذلك يعمل المتجر على الحاسوب ويرسل الحزمة جاهزة، بدل تضمين كل شيء في الصورة.",

    "repos.title": "المستودعات",
    "repos.lede": "مستودعات مستقلة. لا يُستورد شيء من أحدها إلى الآخر: يأتي المسار كوسيط، والارتباط الوحيد هو عقد JSON.",
    "repos.system": "Linux النظيف لكل جهاز",
    "repos.app": "التطبيقات والمتجر",
    "repos.games": "الألعاب",
    "repos.os": "هذا المستودع: يجمع وينشر",
    "repos.all": "كل الإصدارات",

    "license.title": "الرخص",
    "license.systemTitle": "النظام",
    "license.systemText":
      "‏Giochi System برخصة MIT. مكوّنات Buildroot والنواة تحفظ رخصها الأصلية؛ نص كل رخصة داخل الصورة في <code>/usr/share/licenses</code>.",
    "license.appsTitle": "التطبيقات والألعاب",
    "license.appsText":
      "رخصة احتكارية مُعلنة في بيان كل تطبيق. يُرفض التطبيق ذو الرخصة غير المتوافقة مع الصورة عند التغليف — الفحص هنا، ولا يعتمد على تشغيل مستودع آخر قبله.",
    "license.note": "برمجيات حرة، دون ضمان. كتابة الصورة تمحو البطاقة — تحقّق من الجهاز قبل ذلك.",

    "foot.line": "‏Giochi OS · النظام برخصة MIT · التطبيقات الخاصة برخصة احتكارية",
    "foot.code": "الشيفرة",
    "foot.releases": "الإصدارات",
    "foot.docs": "الوثائق التقنية",
    "note.title": "ملاحظات",
    "note.painel": "بُنيت وجُرّبت مع شاشة <code>{modelo}</code>. الوحدات التي بها {outros} تحتاج بناءً آخر — الشاشة بلا EDID، فلا يستطيع النظام التعرّف عليها.",
    "note.compat": "تعمل أيضًا على بعض وحدات {lista} وأشباهها (اللوحة نفسها).",
  },

  bn: {
    "meta.title": "Giochi OS — ডাউনলোড",
    "meta.description":
      "প্রতিটি সমর্থিত ডিভাইসের জন্য Giochi OS ইমেজ। পরিষ্কার Linux সিস্টেম; অ্যাপ স্টোর থেকে ইনস্টল হয়।",
    "meta.ogDescription": "প্রতিটি ডিভাইসের জন্য কার্ডে লেখার তৈরি ইমেজ। সিস্টেম পরিষ্কার Linux; অ্যাপ ইমেজের বাইরে থাকে।",

    "nav.language": "ভাষা",
    "nav.download": "ডাউনলোড",
    "nav.install": "ইনস্টল",
    "nav.devices": "ডিভাইস",
    "nav.project": "প্রকল্প",
    "nav.checksum": "চেকসাম যাচাই করুন",
    "nav.sdCard": "SD কার্ড",
    "nav.qemu": "ভার্চুয়াল মেশিন (QEMU)",
    "nav.deviceList": "তালিকা ও প্রয়োজনীয়তা",
    "nav.about": "কীভাবে তৈরি",
    "nav.repos": "রিপোজিটরি",
    "nav.license": "লাইসেন্স",
    "nav.noJs": "ভাষা বদলাতে JavaScript দরকার। এই পৃষ্ঠা ইংরেজিতে।",

    "hero.eyebrow": "হ্যান্ডহেল্ড কনসোল · ARM64",
    "hero.title": "সিস্টেম আর অ্যাপ, একই জায়গায়।",
    "hero.lede":
      "Giochi OS হলো Buildroot দিয়ে তৈরি পরিষ্কার Linux ভিত্তি, কার্ডের জন্য প্রস্তুত ইমেজ হিসেবে দেওয়া হয়। হার্ডওয়্যার ছাড়া QEMU-তে চেষ্টা করার জন্য ভার্চুয়াল মেশিন ইমেজও আছে। অ্যাপ ইমেজের বাইরে থাকে: আপনি স্টোর থেকে লেখা-যায় এমন পার্টিশনে ইনস্টল করেন এবং যখন চান বদলাতে পারেন।",
    "hero.cta.download": "ইমেজ দেখুন",
    "hero.cta.devices": "সমর্থিত ডিভাইস",
    "hero.count": "{n} রিলিজ প্রকাশিত · {data} তারিখে তৈরি",

    "downloads.title": "ডিভাইস অনুযায়ী ইমেজ",
    "downloads.lede":
      "প্রতিটি ইমেজ সেই হার্ডওয়্যারের জন্য: কার্নেল, ডিভাইস ট্রি, প্যানেল ড্রাইভার ও পার্টিশন বিন্যাস ডিভাইসের, সাধারণ নয়। ভার্চুয়াল মেশিনের ইমেজের কার্ডেই QEMU কমান্ড থাকে।",

    "card.size": "আকার",
    "card.buildroot": "Buildroot",
    "card.appsImage": "ইমেজে অ্যাপ",
    "card.appsStore": "স্টোরে অ্যাপ",
    "card.kernel": "কার্নেল",
    "card.showApps": "{n}টি অ্যাপ দেখুন",
    "card.unavailable": "ইমেজ পাওয়া যাচ্ছে না",
    "card.downloadCard": "ইমেজ ডাউনলোড ({size})",
    "card.downloadDisk": "ডিস্ক ডাউনলোড ({size})",
    "card.kernelButton": "কার্নেল ({size})",
    "card.checksum": "চেকসাম",
    "card.instructions": "নির্দেশনা",
    "card.kindCard": "SD কার্ড",
    "card.kindVirtual": "ভার্চুয়াল মেশিন",
    "card.hintTitle": "এই ডাউনলোড সংকুচিত। <strong>লেখার আগে খুলে নিন</strong> — <code>dd</code> কাঁচা বাইট কপি করে:",
    "card.runSummary": "QEMU-তে কীভাবে চালু করবেন",
    "card.runFirst": "আগে খুলে নিন:",
    "card.runNotes":
      "লগইন <code>root</code>, পাসওয়ার্ড <code>giochi-system</code>. কনসোল ছাড়তে: <code>Ctrl+A</code>, তারপর <code>X</code>. এই ইমেজ হেডলেস: কনসোলই ইন্টারফেস। অ্যাপ আছে <code>/opt/giochi/apps</code>-এ — লঞ্চার চালান <code>SDL_VIDEODRIVER=dummy</code> দিয়ে।",

    "verify.title": "চেকসাম যাচাই করুন",
    "verify.lede":
      "প্রতিটি ডিভাইসের নিজের চেকসাম ফাইল আছে, এবং তা সেই ডিভাইসের <strong>সব</strong> ফাইল কভার করে — ইমেজ, কার্নেল ও প্রকাশিত বাকি সব। কোনো লাইন না মিললে ডাউনলোড নষ্ট: লেখার আগে আবার ডাউনলোড করুন।",
    "verify.place": "<code>&lt;device&gt;</code>-এর জায়গায় আপনার ডিভাইস আইডি দিন। যে লাইনে <code>OK</code> নেই, সেই ফাইল কাজের নয়।",
    "verify.step1": "ডিভাইসের চেকসাম ডাউনলোড করুন",
    "verify.step2": "ফাইলগুলো যে ফোল্ডারে আছে সেখানে চালান",
    "verify.step3": "সম্পূর্ণ নির্দেশনা",
    "verify.step3note":
      "প্রতিটি ডিভাইস <code>&lt;device&gt;-README.txt</code>-ও প্রকাশ করে, যেখানে সেই ফাইলের ধাপে ধাপে নির্দেশনা আছে — কার্ডে লিখুন বা ভার্চুয়াল মেশিনে চালু করুন।",

    "write.title": "SD কার্ডে লিখুন",
    "write.lede":
      "শুধু <strong>SD কার্ড</strong> ইমেজের জন্য। <strong>ভার্চুয়াল মেশিন</strong>-এর ইমেজ কার্ডে যায় না: খুলে নিন এবং ডিভাইস কার্ডে দেওয়া কমান্ড চালান।",
    "write.step1": "খুলে নিন",
    "write.step1note":
      "<code>dd</code> কাঁচা বাইট লেখে। <code>.xz</code>-এর দিকে দেখালে সংকুচিত ফাইল কার্ডে লেখা হবে এবং ডিভাইস বুট হবে না। Zstd: <code>zstd -d</code>; gzip: <code>gunzip -k</code>।",
    "write.step2": "ডিভাইস খুঁজুন",
    "write.step2note":
      "কার্ড সাধারণত <code>/dev/sdX</code> বা <code>/dev/mmcblkX</code>। আকার মিলিয়ে নিন: ৩২ GB কার্ড প্রায় ২৯ GB দেখায়।",
    "write.step3": "লিখুন",
    "write.step3note":
      "<strong>কার্ড সম্পূর্ণ মুছে যাবে।</strong> <code>conv=fsync</code> ঐচ্ছিক নয় — এটি ছাড়া লেখা অসম্পূর্ণ থাকতে পারে।",
    "write.step4": "ফল যাচাই করুন",
    "write.step4note":
      "পার্টিশন নম্বর ডিভাইসের বিন্যাস অনুযায়ী বদলায় — আপনার ডিভাইসের <code>README.txt</code> বলে দেয় কোনটি। এখানে ফাইলসিস্টেম ত্রুটি মানে খারাপ কার্ড বা বাধাগ্রস্ত লেখা।",

    "qemu.title": "ভার্চুয়াল মেশিনে চালান",
    "qemu.lede":
      "সিস্টেম চেনা এবং হার্ডওয়্যার ছাড়া পরীক্ষার জন্য। এটি সেই ডিভাইস নয়: GPU ছাড়া 3D গেম খোলে না, আর সিরিয়াল কনসোলই ইন্টারফেস।",
    "qemu.empty": "এখন কোনো ভার্চুয়াল মেশিন ইমেজ প্রকাশিত নেই। হলে সঠিক কমান্ড এখানে ও তার কার্ডে দেখাবে।",

    "devices.title": "সমর্থিত ডিভাইস",
    "devices.lede":
      "এখন যা প্রকাশিত। কোনো ডিভাইস এই তালিকায় আসে যখন তার জন্য ইমেজ তৈরি ও যাচাই করা হয় — তালিকাটি রিলিজের, রোডম্যাপের প্রতিশ্রুতি নয়।",
    "devices.thDevice": "ডিভাইস",
    "devices.thId": "আইডি",
    "devices.thArch": "আর্কিটেকচার",
    "devices.thType": "ধরন",
    "devices.thVersion": "সংস্করণ",
    "devices.thSize": "আকার",
    "devices.thApps": "অ্যাপ",
    "devices.note":
      "<strong>ধরন</strong> বলে ফাইলটি কীসের জন্য: <em>SD কার্ড</em> ডিভাইসে লেখার জন্য; <em>ভার্চুয়াল মেশিন</em> QEMU ডিস্ক, আর তা কার্ডে লিখলে বুট হওয়া ডিভাইস তৈরি হয় না।",

    "about.title": "কীভাবে তৈরি",
    "about.systemTitle": "Giochi System",
    "about.systemText":
      "Buildroot দিয়ে পরিষ্কার Linux বানায়: প্রতিটি ডিভাইসের কার্নেল, rootfs, বুট, ড্রাইভার ও প্যানেল। এখানে কোনো ইন্টারফেস নেই।",
    "about.appTitle": "Giochi app",
    "about.appText": "অ্যাপগুলো, প্রতিটি নিজের প্রয়োজনীয়তা-তালিকা নিয়ে। ইনস্টলের আগে সিস্টেম তালিকা ও ডিভাইস প্রোফাইল মেলায়।",
    "about.gamesTitle": "Giochi games",
    "about.gamesText": "গেমগুলো, একই তালিকা নিয়ে। বিতরণ <code>image</code> হলে সেগুলো ইমেজে যায়; নইলে স্টোরে থাকে।",
    "about.osTitle": "Giochi OS",
    "about.osText":
      "তিনটিকে জোড়ে: ইমেজের অ্যাপ rootfs-এ ঢোকায়, ইমেজের ভেতরে ফল যাচাই করে এবং চেকসামসহ প্রকাশ করে। এই পৃষ্ঠাটি।",
    "about.noteTitle": "কেন অ্যাপ ইমেজের বাইরে",
    "about.noteText":
      "রুট স্বাক্ষরিত ও শুধু-পড়ার। <code>/user</code>-এ ইনস্টল করা অ্যাপ ব্যবহারকারী বদলাতে পারেন — পরিবর্তিত সংস্করণও, আর GPL সফটওয়্যারের জন্য GPL এটাই চায়। তাই স্টোর কম্পিউটারে চলে এবং প্রস্তুত প্যাকেজ পাঠায়, সবকিছু ইমেজে ঢোকানোর বদলে।",

    "repos.title": "রিপোজিটরি",
    "repos.lede": "স্বতন্ত্র রিপোজিটরি। এক থেকে অন্যটিতে কিছু আমদানি হয় না: পথ আর্গুমেন্ট হিসেবে আসে এবং একমাত্র সংযোগ JSON চুক্তি।",
    "repos.system": "প্রতিটি ডিভাইসের পরিষ্কার Linux",
    "repos.app": "অ্যাপ ও স্টোর",
    "repos.games": "গেমগুলো",
    "repos.os": "এই রিপোজিটরি: জোড়ে ও প্রকাশ করে",
    "repos.all": "সব রিলিজ",

    "license.title": "লাইসেন্স",
    "license.systemTitle": "সিস্টেম",
    "license.systemText":
      "Giochi System MIT লাইসেন্সে। Buildroot ও কার্নেলের উপাদান নিজেদের মূল লাইসেন্স রাখে; প্রতিটির লেখা ইমেজের ভেতরে <code>/usr/share/licenses</code>-এ আছে।",
    "license.appsTitle": "অ্যাপ ও গেম",
    "license.appsText":
      "মালিকানা লাইসেন্স, প্রতিটি অ্যাপের তালিকায় ঘোষিত। ইমেজের সঙ্গে অসংগত লাইসেন্সের অ্যাপ প্যাকেজিংয়ে প্রত্যাখ্যাত হয় — যাচাই এখানে, অন্য রিপোজিটরি আগে চালানোর উপর নির্ভর করে না।",
    "license.note": "মুক্ত সফটওয়্যার, কোনো ওয়ারেন্টি নেই। ইমেজ লিখলে কার্ড মুছে যায় — আগে ডিভাইস যাচাই করুন।",

    "foot.line": "Giochi OS · সিস্টেম MIT লাইসেন্সে · নিজস্ব অ্যাপ মালিকানা লাইসেন্সে",
    "foot.code": "কোড",
    "foot.releases": "রিলিজ",
    "foot.docs": "প্রযুক্তিগত নথি",
    "note.title": "লক্ষণীয়",
    "note.painel": "<code>{modelo}</code> স্ক্রিন দিয়ে তৈরি ও পরীক্ষিত। {outros} থাকা ইউনিটে অন্য বিল্ড দরকার — প্যানেলে EDID নেই, তাই সিস্টেম এটি শনাক্ত করতে পারে না।",
    "note.compat": "{lista}-এর কিছু ইউনিট ও ভ্যারিয়েন্টেও চলে (একই বোর্ড)।",
  },

  pt: {
    "meta.title": "Giochi OS — baixar",
    "meta.description":
      "Imagens do Giochi OS para cada aparelho suportado. Sistema Linux limpo; os apps instalam pela loja.",
    "meta.ogDescription": "Imagem pronta para o cartão, por aparelho. O sistema é Linux limpo; os apps vivem fora da imagem.",

    "nav.language": "Idioma",
    "nav.download": "Baixar",
    "nav.install": "Instalar",
    "nav.devices": "Aparelhos",
    "nav.project": "Projeto",
    "nav.checksum": "Conferir o checksum",
    "nav.sdCard": "Cartão SD",
    "nav.qemu": "Máquina virtual (QEMU)",
    "nav.deviceList": "Lista e requisitos",
    "nav.about": "Como é feito",
    "nav.repos": "Repositórios",
    "nav.license": "Licenças",
    "nav.noJs": "O seletor de idioma precisa de JavaScript. Esta página está em inglês.",

    "hero.eyebrow": "Console portátil · ARM64",
    "hero.title": "O sistema, e os apps, no mesmo lugar.",
    "hero.lede":
      "O Giochi OS é a base Linux limpa construída com Buildroot, entregue como imagem pronta para o cartão. Também há imagem de máquina virtual, para testar no QEMU sem hardware. Os apps vivem fora da imagem: você instala pela loja, na partição gravável, e pode substituí-los quando quiser.",
    "hero.cta.download": "Ver imagens",
    "hero.cta.devices": "Aparelhos suportados",
    "hero.count": "{n} release(s) publicada(s) · gerado em {data}",

    "downloads.title": "Imagens por aparelho",
    "downloads.lede":
      "Cada imagem é específica do hardware: kernel, device tree, driver de painel e layout de partição são do aparelho, não genéricos. As de máquina virtual trazem o comando do QEMU no próprio card.",

    "card.size": "Tamanho",
    "card.buildroot": "Buildroot",
    "card.appsImage": "Apps na imagem",
    "card.appsStore": "Apps na loja",
    "card.kernel": "Kernel",
    "card.showApps": "Ver os {n} app(s)",
    "card.unavailable": "imagem indisponível",
    "card.downloadCard": "Baixar imagem ({size})",
    "card.downloadDisk": "Baixar disco ({size})",
    "card.kernelButton": "Kernel ({size})",
    "card.checksum": "Checksum",
    "card.instructions": "Instruções",
    "card.kindCard": "Cartão SD",
    "card.kindVirtual": "Máquina virtual",
    "card.hintTitle": "Este download é comprimido. <strong>Descomprima antes de gravar</strong> — o <code>dd</code> copia bytes crus:",
    "card.runSummary": "Como iniciar no QEMU",
    "card.runFirst": "Descomprima primeiro:",
    "card.runNotes":
      "Login <code>root</code>, senha <code>giochi-system</code>. Para sair do console: <code>Ctrl+A</code>, depois <code>X</code>. Esta imagem é headless: o console é a interface. Os apps estão em <code>/opt/giochi/apps</code> — rode o launcher com <code>SDL_VIDEODRIVER=dummy</code>.",

    "verify.title": "Conferir o checksum",
    "verify.lede":
      "Cada aparelho tem o seu arquivo de checksums, e ele cobre <strong>todos</strong> os arquivos daquele aparelho — imagem, kernel e o que mais for publicado. Se algum não conferir, o download veio corrompido: baixe de novo antes de gravar.",
    "verify.place": "Troque <code>&lt;device&gt;</code> pelo id do seu aparelho. Cada linha que não disser <code>OK</code> é um arquivo que não presta.",
    "verify.step1": "Baixe o checksum do aparelho",
    "verify.step2": "Rode na mesma pasta dos arquivos",
    "verify.step3": "Instruções completas",
    "verify.step3note":
      "Cada aparelho publica um <code>&lt;device&gt;-README.txt</code> com o passo a passo daquele arquivo — gravar no cartão ou iniciar na máquina virtual.",

    "write.title": "Gravar no cartão SD",
    "write.lede":
      "Só para as imagens de <strong>cartão SD</strong>. As de <strong>máquina virtual</strong> não vão para cartão: descomprima e rode o comando que está no card do aparelho.",
    "write.step1": "Descomprima",
    "write.step1note":
      "O <code>dd</code> grava bytes crus. Apontar para o <code>.xz</code> escreveria o arquivo comprimido no cartão e o aparelho não inicializaria. Zstd: <code>zstd -d</code>; gzip: <code>gunzip -k</code>.",
    "write.step2": "Descubra o dispositivo",
    "write.step2note":
      "O cartão costuma ser <code>/dev/sdX</code> ou <code>/dev/mmcblkX</code>. Confira o tamanho: um cartão de 32 GB aparece com cerca de 29 GB.",
    "write.step3": "Grave",
    "write.step3note":
      "<strong>O cartão será apagado por completo.</strong> <code>conv=fsync</code> não é opcional — sem ele a gravação pode ser truncada.",
    "write.step4": "Confira o resultado",
    "write.step4note":
      "O número da partição muda com o layout do aparelho — o <code>README.txt</code> do seu aparelho diz qual. Erro de filesystem aqui significa cartão ruim ou gravação interrompida.",

    "qemu.title": "Rodar na máquina virtual",
    "qemu.lede":
      "Serve para conhecer o sistema e testar sem hardware. Não é o aparelho: sem GPU, os jogos 3D não abrem, e o console serial é a interface.",
    "qemu.empty": "Nenhuma imagem de máquina virtual publicada no momento. Quando houver, o comando exato aparece aqui e no card dela.",

    "devices.title": "Aparelhos suportados",
    "devices.lede":
      "O que está publicado agora. Um aparelho entra nesta lista quando existe imagem construída e verificada para ele — a lista é a das releases, não uma promessa de roadmap.",
    "devices.thDevice": "Aparelho",
    "devices.thId": "Id",
    "devices.thArch": "Arquitetura",
    "devices.thType": "Tipo",
    "devices.thVersion": "Versão",
    "devices.thSize": "Tamanho",
    "devices.thApps": "Apps",
    "devices.note":
      "<strong>Tipo</strong> diz o destino do arquivo: <em>Cartão SD</em> é para gravar no aparelho; <em>Máquina virtual</em> é um disco de QEMU, e gravar num cartão não produz um aparelho que inicializa.",

    "about.title": "Como é feito",
    "about.systemTitle": "Giochi System",
    "about.systemText":
      "Monta o Linux limpo com Buildroot: kernel, rootfs, boot, drivers e painel de cada aparelho. Nada de interface aqui.",
    "about.appTitle": "Giochi app",
    "about.appText":
      "Os apps, cada um com seu manifesto de requisitos. O sistema compara o manifesto com o perfil do aparelho antes de instalar.",
    "about.gamesTitle": "Giochi games",
    "about.gamesText":
      "Os jogos, com o mesmo manifesto. Entram na imagem quando são de distribuição <code>image</code>; ficam para a loja quando não são.",
    "about.osTitle": "Giochi OS",
    "about.osText":
      "Junta os três: embute os apps de imagem no rootfs, confere o resultado dentro da imagem e publica com checksum. É esta página.",
    "about.noteTitle": "Por que apps ficam fora da imagem",
    "about.noteText":
      "A raiz é assinada e imutável. Apps instalados em <code>/user</code> podem ser substituídos pelo usuário — inclusive por uma versão modificada, que é o que a GPL exige de software GPL. Por isso a loja fica no computador e envia o pacote pronto, em vez de embutir tudo na imagem.",

    "repos.title": "Repositórios",
    "repos.lede":
      "Repositórios independentes. Nada é importado de um para o outro: o caminho entra por argumento e o único acoplamento é o contrato em JSON.",
    "repos.system": "o Linux limpo de cada aparelho",
    "repos.app": "os apps e a loja",
    "repos.games": "os jogos",
    "repos.os": "este repositório: junta e publica",
    "repos.all": "Todas as releases",

    "license.title": "Licenças",
    "license.systemTitle": "Sistema",
    "license.systemText":
      "Giochi System sob licença MIT. Os componentes do Buildroot e do kernel mantêm as licenças de origem; o texto de cada uma está dentro da imagem, em <code>/usr/share/licenses</code>.",
    "license.appsTitle": "Apps e jogos",
    "license.appsText":
      "Licença proprietária, declarada no manifesto de cada app. App com licença incompatível com a imagem é recusado no empacotamento — a checagem é daqui, não de outro repositório ter rodado antes.",
    "license.note": "Software livre, sem garantia. Gravar imagem apaga o cartão — verifique o dispositivo antes.",

    "foot.line": "Giochi OS · sistema sob licença MIT · apps próprios sob licença proprietária",
    "foot.code": "código",
    "foot.releases": "releases",
    "foot.docs": "documentação técnica",
    "note.title": "Observações",
    "note.painel": "Construída e testada com a tela <code>{modelo}</code>. Unidades com {outros} precisam de outra build — o painel não tem EDID, então o sistema não consegue detectá-lo.",
    "note.compat": "Também roda em algumas unidades do {lista} e variantes (mesma placa).",
  },

  ru: {
    "meta.title": "Giochi OS — скачать",
    "meta.description":
      "Образы Giochi OS для каждого поддерживаемого устройства. Чистая система Linux; приложения ставятся из магазина.",
    "meta.ogDescription": "Готовый для карты образ, для каждого устройства. Система — чистый Linux; приложения вне образа.",

    "nav.language": "Язык",
    "nav.download": "Скачать",
    "nav.install": "Установка",
    "nav.devices": "Устройства",
    "nav.project": "Проект",
    "nav.checksum": "Проверить контрольную сумму",
    "nav.sdCard": "Карта SD",
    "nav.qemu": "Виртуальная машина (QEMU)",
    "nav.deviceList": "Список и требования",
    "nav.about": "Как это сделано",
    "nav.repos": "Репозитории",
    "nav.license": "Лицензии",
    "nav.noJs": "Для переключения языка нужен JavaScript. Эта страница на английском.",

    "hero.eyebrow": "Портативная консоль · ARM64",
    "hero.title": "Система и приложения в одном месте.",
    "hero.lede":
      "Giochi OS — чистая база Linux, собранная с Buildroot и поставляемая как готовый для карты образ. Есть и образ виртуальной машины, чтобы попробовать в QEMU без железа. Приложения живут вне образа: вы ставите их из магазина на записываемый раздел и можете заменять когда угодно.",
    "hero.cta.download": "Смотреть образы",
    "hero.cta.devices": "Поддерживаемые устройства",
    "hero.count": "Опубликовано версий: {n} · создано {data}",

    "downloads.title": "Образы по устройствам",
    "downloads.lede":
      "Каждый образ привязан к своему железу: ядро, device tree, драйвер экрана и разметка разделов принадлежат устройству, они не универсальны. В образах виртуальной машины команда QEMU указана прямо в карточке.",

    "card.size": "Размер",
    "card.buildroot": "Buildroot",
    "card.appsImage": "Приложений в образе",
    "card.appsStore": "Приложений в магазине",
    "card.kernel": "Ядро",
    "card.showApps": "Показать приложений: {n}",
    "card.unavailable": "образ недоступен",
    "card.downloadCard": "Скачать образ ({size})",
    "card.downloadDisk": "Скачать диск ({size})",
    "card.kernelButton": "Ядро ({size})",
    "card.checksum": "Контрольная сумма",
    "card.instructions": "Инструкции",
    "card.kindCard": "Карта SD",
    "card.kindVirtual": "Виртуальная машина",
    "card.hintTitle": "Этот файл сжат. <strong>Распакуйте перед записью</strong> — <code>dd</code> копирует сырые байты:",
    "card.runSummary": "Как запустить в QEMU",
    "card.runFirst": "Сначала распакуйте:",
    "card.runNotes":
      "Логин <code>root</code>, пароль <code>giochi-system</code>. Выйти из консоли: <code>Ctrl+A</code>, затем <code>X</code>. Образ без графики: консоль и есть интерфейс. Приложения в <code>/opt/giochi/apps</code> — запускайте лончер с <code>SDL_VIDEODRIVER=dummy</code>.",

    "verify.title": "Проверить контрольную сумму",
    "verify.lede":
      "У каждого устройства свой файл контрольных сумм, и он покрывает <strong>все</strong> файлы этого устройства — образ, ядро и всё остальное опубликованное. Если хоть одна строка не совпала, загрузка повреждена: скачайте заново перед записью.",
    "verify.place":
      "Замените <code>&lt;device&gt;</code> на идентификатор вашего устройства. Любая строка без <code>OK</code> — файл, который не годится.",
    "verify.step1": "Скачайте контрольную сумму устройства",
    "verify.step2": "Запустите в той же папке, где файлы",
    "verify.step3": "Полные инструкции",
    "verify.step3note":
      "Каждое устройство публикует ещё и <code>&lt;device&gt;-README.txt</code> с пошаговой инструкцией для своего файла — записать на карту или запустить в виртуальной машине.",

    "write.title": "Запись на карту SD",
    "write.lede":
      "Только для образов <strong>карты SD</strong>. Образы <strong>виртуальной машины</strong> на карту не идут: распакуйте и выполните команду из карточки устройства.",
    "write.step1": "Распакуйте",
    "write.step1note":
      "<code>dd</code> пишет сырые байты. Если указать <code>.xz</code>, на карту попадёт сжатый файл и устройство не загрузится. Zstd: <code>zstd -d</code>; gzip: <code>gunzip -k</code>.",
    "write.step2": "Найдите устройство",
    "write.step2note":
      "Карта обычно <code>/dev/sdX</code> или <code>/dev/mmcblkX</code>. Проверьте размер: карта на 32 ГБ видна примерно как 29 ГБ.",
    "write.step3": "Запишите",
    "write.step3note":
      "<strong>Карта будет полностью стёрта.</strong> <code>conv=fsync</code> не опция — без него запись может обрезаться.",
    "write.step4": "Проверьте результат",
    "write.step4note":
      "Номер раздела зависит от разметки устройства — в <code>README.txt</code> вашего устройства указано, какой. Ошибка файловой системы здесь означает плохую карту или прерванную запись.",

    "qemu.title": "Запуск в виртуальной машине",
    "qemu.lede":
      "Нужно, чтобы познакомиться с системой и проверить без железа. Это не само устройство: без GPU 3D-игры не открываются, а последовательная консоль и есть интерфейс.",
    "qemu.empty": "Сейчас нет опубликованного образа виртуальной машины. Когда появится, точная команда будет здесь и в его карточке.",

    "devices.title": "Поддерживаемые устройства",
    "devices.lede":
      "То, что опубликовано сейчас. Устройство попадает в этот список, когда для него есть собранный и проверенный образ — список из релизов, а не обещание плана.",
    "devices.thDevice": "Устройство",
    "devices.thId": "Идентификатор",
    "devices.thArch": "Архитектура",
    "devices.thType": "Тип",
    "devices.thVersion": "Версия",
    "devices.thSize": "Размер",
    "devices.thApps": "Приложений",
    "devices.note":
      "<strong>Тип</strong> говорит, куда идёт файл: <em>Карта SD</em> — для записи на устройство; <em>Виртуальная машина</em> — диск QEMU, и запись его на карту не даёт загружающегося устройства.",

    "about.title": "Как это сделано",
    "about.systemTitle": "Giochi System",
    "about.systemText":
      "Собирает чистый Linux с Buildroot: ядро, rootfs, загрузка, драйверы и экран каждого устройства. Интерфейса здесь нет.",
    "about.appTitle": "Giochi app",
    "about.appText":
      "Приложения, каждое со своим манифестом требований. Перед установкой система сравнивает манифест с профилем устройства.",
    "about.gamesTitle": "Giochi games",
    "about.gamesText":
      "Игры, с тем же манифестом. Они попадают в образ, когда их распространение — <code>image</code>; иначе остаются в магазине.",
    "about.osTitle": "Giochi OS",
    "about.osText":
      "Соединяет три: встраивает приложения образа в rootfs, проверяет результат внутри образа и публикует с контрольной суммой. Это и есть эта страница.",
    "about.noteTitle": "Почему приложения вне образа",
    "about.noteText":
      "Корень подписан и только для чтения. Приложения, установленные в <code>/user</code>, пользователь может заменить — в том числе изменённой версией, и именно этого GPL требует от GPL-программ. Поэтому магазин работает на компьютере и отправляет готовый пакет, а не встраивает всё в образ.",

    "repos.title": "Репозитории",
    "repos.lede":
      "Независимые репозитории. Из одного в другой ничего не импортируется: путь приходит аргументом, и единственная связь — контракт в JSON.",
    "repos.system": "чистый Linux каждого устройства",
    "repos.app": "приложения и магазин",
    "repos.games": "игры",
    "repos.os": "этот репозиторий: соединяет и публикует",
    "repos.all": "Все версии",

    "license.title": "Лицензии",
    "license.systemTitle": "Система",
    "license.systemText":
      "Giochi System под лицензией MIT. Компоненты Buildroot и ядра сохраняют свои исходные лицензии; текст каждой лежит внутри образа, в <code>/usr/share/licenses</code>.",
    "license.appsTitle": "Приложения и игры",
    "license.appsText":
      "Проприетарная лицензия, указанная в манифесте каждого приложения. Приложение с лицензией, несовместимой с образом, отклоняется при упаковке — проверка здесь, она не зависит от того, запускали ли другой репозиторий раньше.",
    "license.note": "Свободное ПО, без гарантий. Запись образа стирает карту — проверьте устройство заранее.",

    "foot.line": "Giochi OS · система под лицензией MIT · собственные приложения под проприетарной лицензией",
    "foot.code": "код",
    "foot.releases": "версии",
    "foot.docs": "техническая документация",
    "note.title": "Примечания",
    "note.painel": "Собрано и проверено с экраном <code>{modelo}</code>. Устройствам с {outros} нужна другая сборка — у панели нет EDID, поэтому система не может её определить.",
    "note.compat": "Также работает на части устройств {lista} и их вариантах (та же плата).",
  },

  ur: {
    "meta.title": "Giochi OS — ڈاؤن لوڈ",
    "meta.description":
      "ہر تعاون یافتہ ڈیوائس کے لیے Giochi OS امیج۔ صاف Linux نظام؛ ایپس اسٹور سے انسٹال ہوتی ہیں۔",
    "meta.ogDescription": "ہر ڈیوائس کے لیے کارڈ پر لکھنے کو تیار امیج۔ نظام صاف Linux ہے؛ ایپس امیج سے باہر رہتی ہیں۔",

    "nav.language": "زبان",
    "nav.download": "ڈاؤن لوڈ",
    "nav.install": "انسٹال",
    "nav.devices": "ڈیوائسز",
    "nav.project": "منصوبہ",
    "nav.checksum": "چیک سم جانچیں",
    "nav.sdCard": "SD کارڈ",
    "nav.qemu": "ورچوئل مشین (QEMU)",
    "nav.deviceList": "فہرست اور تقاضے",
    "nav.about": "یہ کیسے بنتا ہے",
    "nav.repos": "ریپوزٹریز",
    "nav.license": "لائسنس",
    "nav.noJs": "زبان بدلنے کے لیے JavaScript درکار ہے۔ یہ صفحہ انگریزی میں ہے۔",

    "hero.eyebrow": "ہینڈ ہیلڈ کنسول · ARM64",
    "hero.title": "نظام اور ایپس، ایک ہی جگہ۔",
    "hero.lede":
      "Giochi OS وہ صاف Linux بنیاد ہے جو Buildroot سے بنتی ہے اور کارڈ کے لیے تیار امیج کی صورت میں آتی ہے۔ بغیر ہارڈویئر QEMU میں آزمانے کے لیے ورچوئل مشین امیج بھی ہے۔ ایپس امیج سے باہر رہتی ہیں: آپ انہیں اسٹور سے لکھنے کے قابل پارٹیشن پر انسٹال کرتے ہیں اور جب چاہیں بدل سکتے ہیں۔",
    "hero.cta.download": "امیج دیکھیں",
    "hero.cta.devices": "تعاون یافتہ ڈیوائسز",
    "hero.count": "{n} ریلیز شائع · {data} کو بنایا گیا",

    "downloads.title": "ہر ڈیوائس کے لیے امیج",
    "downloads.lede":
      "ہر امیج اسی ہارڈویئر کے لیے ہے: کرنل، ڈیوائس ٹری، پینل ڈرائیور اور پارٹیشن ترتیب ڈیوائس کی ہیں، عام نہیں۔ ورچوئل مشین والی امیج کے کارڈ میں QEMU کمانڈ موجود ہوتی ہے۔",

    "card.size": "حجم",
    "card.buildroot": "Buildroot",
    "card.appsImage": "امیج میں ایپس",
    "card.appsStore": "اسٹور میں ایپس",
    "card.kernel": "کرنل",
    "card.showApps": "{n} ایپس دیکھیں",
    "card.unavailable": "امیج دستیاب نہیں",
    "card.downloadCard": "امیج ڈاؤن لوڈ کریں ({size})",
    "card.downloadDisk": "ڈسک ڈاؤن لوڈ کریں ({size})",
    "card.kernelButton": "کرنل ({size})",
    "card.checksum": "چیک سم",
    "card.instructions": "ہدایات",
    "card.kindCard": "SD کارڈ",
    "card.kindVirtual": "ورچوئل مشین",
    "card.hintTitle": "یہ ڈاؤن لوڈ کمپریسڈ ہے۔ <strong>لکھنے سے پہلے کھولیں</strong> — <code>dd</code> خام بائٹس کاپی کرتا ہے:",
    "card.runSummary": "QEMU میں کیسے شروع کریں",
    "card.runFirst": "پہلے کھولیں:",
    "card.runNotes":
      "لاگ ان <code>root</code>، پاس ورڈ <code>giochi-system</code>۔ کنسول چھوڑنے کے لیے: <code>Ctrl+A</code>، پھر <code>X</code>۔ یہ امیج ہیڈ لیس ہے: کنسول ہی انٹرفیس ہے۔ ایپس <code>/opt/giochi/apps</code> میں ہیں — لانچر <code>SDL_VIDEODRIVER=dummy</code> کے ساتھ چلائیں۔",

    "verify.title": "چیک سم جانچیں",
    "verify.lede":
      "ہر ڈیوائس کی اپنی چیک سم فائل ہے اور وہ اُس ڈیوائس کی <strong>ہر</strong> فائل کا احاطہ کرتی ہے — امیج، کرنل اور باقی شائع شدہ۔ اگر کوئی سطر نہ ملے تو ڈاؤن لوڈ خراب ہے: لکھنے سے پہلے دوبارہ ڈاؤن لوڈ کریں۔",
    "verify.place": "<code>&lt;device&gt;</code> کی جگہ اپنی ڈیوائس آئی ڈی رکھیں۔ جو سطر <code>OK</code> نہ کہے وہ فائل کام کی نہیں۔",
    "verify.step1": "ڈیوائس کی چیک سم ڈاؤن لوڈ کریں",
    "verify.step2": "فائلوں والے فولڈر میں چلائیں",
    "verify.step3": "مکمل ہدایات",
    "verify.step3note":
      "ہر ڈیوائس <code>&lt;device&gt;-README.txt</code> بھی شائع کرتی ہے، جس میں اُس فائل کے لیے مرحلہ وار ہدایات ہیں — کارڈ پر لکھیں یا ورچوئل مشین میں چلائیں۔",

    "write.title": "SD کارڈ پر لکھیں",
    "write.lede":
      "صرف <strong>SD کارڈ</strong> امیج کے لیے۔ <strong>ورچوئل مشین</strong> والی کارڈ پر نہیں جاتیں: انہیں کھولیں اور ڈیوائس کارڈ میں دی گئی کمانڈ چلائیں۔",
    "write.step1": "کھولیں",
    "write.step1note":
      "<code>dd</code> خام بائٹس لکھتا ہے۔ <code>.xz</code> کی طرف اشارہ کرنے سے کمپریسڈ فائل کارڈ پر چلی جائے گی اور ڈیوائس بوٹ نہیں ہوگی۔ Zstd: <code>zstd -d</code>؛ gzip: <code>gunzip -k</code>۔",
    "write.step2": "ڈیوائس تلاش کریں",
    "write.step2note":
      "کارڈ عام طور پر <code>/dev/sdX</code> یا <code>/dev/mmcblkX</code> ہوتا ہے۔ حجم دیکھیں: 32 GB کا کارڈ تقریباً 29 GB دکھتا ہے۔",
    "write.step3": "لکھیں",
    "write.step3note":
      "<strong>کارڈ مکمل طور پر مٹ جائے گا۔</strong> <code>conv=fsync</code> اختیاری نہیں — اس کے بغیر لکھائی ادھوری رہ سکتی ہے۔",
    "write.step4": "نتیجہ جانچیں",
    "write.step4note":
      "پارٹیشن نمبر ڈیوائس کی ترتیب سے بدلتا ہے — آپ کی ڈیوائس کا <code>README.txt</code> بتاتا ہے کون سا۔ یہاں فائل سسٹم خرابی کا مطلب خراب کارڈ یا رکی ہوئی لکھائی ہے۔",

    "qemu.title": "ورچوئل مشین میں چلائیں",
    "qemu.lede":
      "نظام جاننے اور بغیر ہارڈویئر جانچنے کے لیے۔ یہ وہ ڈیوائس نہیں: GPU کے بغیر 3D گیمز نہیں کھلتیں اور سیریل کنسول ہی انٹرفیس ہے۔",
    "qemu.empty": "ابھی کوئی ورچوئل مشین امیج شائع نہیں ہوئی۔ جب ہوگی، درست کمانڈ یہاں اور اس کے کارڈ میں دکھے گی۔",

    "devices.title": "تعاون یافتہ ڈیوائسز",
    "devices.lede":
      "ابھی جو شائع ہے۔ ڈیوائس اس فہرست میں تب آتی ہے جب اس کے لیے امیج بنی اور جانچی جا چکی ہو — فہرست ریلیز کی ہے، روڈ میپ کا وعدہ نہیں۔",
    "devices.thDevice": "ڈیوائس",
    "devices.thId": "آئی ڈی",
    "devices.thArch": "آرکیٹیکچر",
    "devices.thType": "قسم",
    "devices.thVersion": "ورژن",
    "devices.thSize": "حجم",
    "devices.thApps": "ایپس",
    "devices.note":
      "<strong>قسم</strong> بتاتی ہے فائل کس لیے ہے: <em>SD کارڈ</em> ڈیوائس پر لکھنے کے لیے؛ <em>ورچوئل مشین</em> QEMU ڈسک ہے، اور اسے کارڈ پر لکھنے سے بوٹ ہونے والی ڈیوائس نہیں بنتی۔",

    "about.title": "یہ کیسے بنتا ہے",
    "about.systemTitle": "Giochi System",
    "about.systemText":
      "Buildroot سے صاف Linux بناتا ہے: ہر ڈیوائس کے لیے کرنل، rootfs، بوٹ، ڈرائیور اور پینل۔ یہاں کوئی انٹرفیس نہیں۔",
    "about.appTitle": "Giochi app",
    "about.appText": "ایپس، ہر ایک اپنی تقاضا فہرست کے ساتھ۔ انسٹال سے پہلے نظام فہرست کو ڈیوائس پروفائل سے ملاتا ہے۔",
    "about.gamesTitle": "Giochi games",
    "about.gamesText": "گیمز، اسی فہرست کے ساتھ۔ تقسیم <code>image</code> ہو تو وہ امیج میں جاتی ہیں؛ ورنہ اسٹور میں رہتی ہیں۔",
    "about.osTitle": "Giochi OS",
    "about.osText":
      "تینوں کو جوڑتا ہے: امیج کی ایپس rootfs میں ڈالتا ہے، امیج کے اندر نتیجہ جانچتا ہے اور چیک سم کے ساتھ شائع کرتا ہے۔ یہی یہ صفحہ ہے۔",
    "about.noteTitle": "ایپس امیج سے باہر کیوں",
    "about.noteText":
      "روٹ دستخط شدہ اور صرف پڑھنے کے قابل ہے۔ <code>/user</code> میں انسٹال ایپس صارف بدل سکتا ہے — بدلی ہوئی نقل بھی، اور GPL سافٹ ویئر کے لیے GPL یہی مانگتی ہے۔ اسی لیے اسٹور کمپیوٹر پر چلتا ہے اور تیار پیکج بھیجتا ہے، سب کچھ امیج میں ڈالنے کے بجائے۔",

    "repos.title": "ریپوزٹریز",
    "repos.lede": "الگ ریپوزٹریز۔ ایک سے دوسری میں کچھ درآمد نہیں ہوتا: راستہ آرگیومنٹ کے طور پر آتا ہے اور واحد ربط JSON معاہدہ ہے۔",
    "repos.system": "ہر ڈیوائس کے لیے صاف Linux",
    "repos.app": "ایپس اور اسٹور",
    "repos.games": "گیمز",
    "repos.os": "یہ ریپوزٹری: جوڑتی اور شائع کرتی ہے",
    "repos.all": "تمام ریلیز",

    "license.title": "لائسنس",
    "license.systemTitle": "نظام",
    "license.systemText":
      "Giochi System MIT لائسنس کے تحت۔ Buildroot اور کرنل کے اجزا اپنے اصل لائسنس رکھتے ہیں؛ ہر ایک کا متن امیج کے اندر <code>/usr/share/licenses</code> میں ہے۔",
    "license.appsTitle": "ایپس اور گیمز",
    "license.appsText":
      "ملکیتی لائسنس، ہر ایپ کی فہرست میں اعلان شدہ۔ امیج سے غیر موافق لائسنس والی ایپ پیکجنگ میں مسترد ہوتی ہے — جانچ یہاں ہے، کسی دوسری ریپوزٹری کے پہلے چلنے پر منحصر نہیں۔",
    "license.note": "آزاد سافٹ ویئر، کوئی ضمانت نہیں۔ امیج لکھنے سے کارڈ مٹ جاتا ہے — پہلے ڈیوائس جانچیں۔",

    "foot.line": "Giochi OS · نظام MIT لائسنس کے تحت · اپنی ایپس ملکیتی لائسنس کے تحت",
    "foot.code": "کوڈ",
    "foot.releases": "ریلیز",
    "foot.docs": "تکنیکی دستاویزات",
    "note.title": "ملاحظات",
    "note.painel": "<code>{modelo}</code> اسکرین کے ساتھ بنایا اور جانچا گیا۔ {outros} والی اکائیوں کے لیے دوسری بلڈ درکار ہے — پینل میں EDID نہیں، اس لیے نظام اسے پہچان نہیں سکتا۔",
    "note.compat": "{lista} کی کچھ اکائیوں اور ان کے متبادلوں پر بھی چلتا ہے (ایک ہی بورڈ)۔",
  },
};

/** Tags permitidas em `data-i18n-html`. Qualquer outra é recusada. */
export const TAGS_PERMITIDAS = ["code", "strong", "em"];

/**
 * Marcadores que o código substitui.
 *
 * `n`, `size` e `data` vêm dos `data-i18n-vars` de cada elemento; `modelo`,
 * `outros` e `lista` vêm das observações por aparelho (`device-notes.mjs`).
 * Um marcador fora desta lista nunca é substituído e apareceria literal na
 * tela — por isso a validação recusa.
 */
export const MARCADORES_PERMITIDOS = ["n", "size", "data", "modelo", "outros", "lista"];

/**
 * Problemas no dicionário: chave faltando, tag não permitida, idioma sem texto.
 *
 * Devolve lista vazia quando está tudo certo. O gerador chama isto e **falha** se
 * houver algo — texto faltando vira `undefined` na tela, e tag não permitida em
 * `innerHTML` é execução de script com outro nome.
 */
export function validarTraducoes() {
  const problemas = [];
  const referencia = Object.keys(TEXTOS[PADRAO]);

  for (const idioma of IDIOMAS) {
    const textos = TEXTOS[idioma.code];
    if (!textos) {
      problemas.push(`${idioma.code}: sem textos`);
      continue;
    }
    for (const chave of referencia) {
      if (!(chave in textos)) problemas.push(`${idioma.code}: falta "${chave}"`);
    }
    for (const chave of Object.keys(textos)) {
      if (!referencia.includes(chave)) problemas.push(`${idioma.code}: chave a mais "${chave}"`);
      const valor = textos[chave];
      if (typeof valor !== "string" || valor.trim() === "") {
        problemas.push(`${idioma.code}: "${chave}" vazio`);
        continue;
      }
      const tags = [...valor.matchAll(/<\/?([a-zA-Z][\w-]*)/g)].map((m) => m[1].toLowerCase());
      for (const tag of tags) {
        if (!TAGS_PERMITIDAS.includes(tag)) {
          problemas.push(`${idioma.code}: "${chave}" usa <${tag}>, que não é permitida`);
        }
      }
      // Marcadores usados no texto têm de ser só os que o script substitui.
      for (const m of valor.matchAll(/\{(\w+)\}/g)) {
        if (!MARCADORES_PERMITIDOS.includes(m[1])) {
          problemas.push(`${idioma.code}: "${chave}" usa marcador desconhecido {${m[1]}}`);
        }
      }
    }
  }

  return problemas;
}
