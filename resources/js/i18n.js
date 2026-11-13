const STORAGE_KEY = 'scrapbound.language.v1';
const DEFAULT_LOCALE = 'pt-BR';

const ptBR = {
  'WORKSHOP': 'OFICINA', 'Factory': 'Fábrica', 'Factory floor': 'Chão de fábrica', 'Brain lab': 'Laboratório de programação', 'Tech tree': 'Árvore tecnológica', 'Technology tree': 'Árvore tecnológica', 'Expeditions': 'Expedições', 'Community': 'Comunidade', 'Community board': 'Mural da comunidade', 'Catalog studio': 'Estúdio de catálogo', 'Tech editor': 'Editor de tecnologia',
  'FRONTIER SECTOR 07': 'SETOR DA FRONTEIRA 07', 'CYCLE': 'CICLO', 'CYCLE 01 · 1 UNITS': 'CICLO 01 · 1 UNIDADE', 'LIVE WORKSHOP': 'OFICINA AO VIVO', 'Assembly bay': 'Linha de montagem', 'LIVE': 'AO VIVO', 'Drag to orbit · scroll to zoom': 'Arraste para girar · role para ampliar', 'Follow robot': 'Seguir robô', 'Free camera': 'Câmera livre', 'Quality': 'Qualidade', 'Reduced motion': 'Movimento reduzido', 'Ⅱ Pause': 'Ⅱ Pausar', '1× Speed': 'Velocidade 1×', '⛶ Full screen': 'Tela cheia ⛶', 'Reset camera': 'Redefinir câmera', 'Quick purchases': 'Compras rápidas', 'Your robot activity will appear here.': 'A atividade dos seus robôs aparecerá aqui.', 'ACTIVE UNITS': 'ROBÔS ATIVOS', 'SIMULATION': 'SIMULAÇÃO', 'FREE CAMERA': 'CÂMERA LIVRE',
  'AUTOMATION': 'AUTOMAÇÃO', 'Robot crew': 'Equipe de robôs', 'LOCAL CREDITS': 'CRÉDITOS LOCAIS', 'LOCAL SCRAP': 'SUCATA LOCAL', 'CORE SHARDS': 'FRAGMENTOS NUCLEARES', 'FACTORY RANK': 'NÍVEL DA FÁBRICA', 'JOB DELIVERIES': 'ENTREGAS DOS ROBÔS', 'PRESTIGE': 'PRESTÍGIO', 'Saved locally': 'Salvo localmente', 'Sign in': 'Entrar', 'Settings': 'Configurações', 'SERVER ¢0': 'SERVIDOR ¢0', 'SERVER ▧0': 'SERVIDOR ▧0', 'LOCAL SIMULATION': 'SIMULAÇÃO LOCAL', 'SYNC: BROWSER SAVE': 'SINCRONIZAÇÃO: SALVO NO NAVEGADOR', 'Saved locally': 'Salvo localmente',
  'Factory contract': 'Contrato da fábrica', 'A little delivery goes a long way': 'Uma pequena entrega já ajuda muito', 'Deliver 4 cargo units to the depot.': 'Entregue 4 cargas no depósito.', 'Your crew is running. Buy upgrades while they collect.': 'Sua equipe está trabalhando. Compre melhorias enquanto ela coleta.', 'LIVE PRODUCTION': 'PRODUÇÃO AO VIVO', 'Cargo in transit': 'Carga em trânsito', 'Core output bonus': 'Bônus de produção nuclear', 'From scrap to an empire.': 'Da sucata a um império.', 'Build your crew. Tune the routine. Let the machines work.': 'Monte sua equipe. Ajuste a rotina. Deixe as máquinas trabalharem.', 'Build a second robot. More hands means more salvage runs.': 'Construa um segundo robô. Mais mãos significam mais expedições.', 'Build a robot ↗': 'Construir robô ↗', 'NEXT OBJECTIVE': 'PRÓXIMO OBJETIVO', 'You are not alone': 'Você não está só', 'Build your crew': 'Monte sua equipe', 'Robots only earn by following their program, collecting a visible salvage cache, and returning cargo to the bay. Change their behavior in Brain lab.': 'Os robôs só ganham recursos ao seguir seu programa, coletar sucata visível e retornar à base. Mude o comportamento no Laboratório de programação.',
  'RESEARCH & DEVELOPMENT': 'PESQUISA E DESENVOLVIMENTO', 'Workshop upgrades': 'Melhorias da oficina', 'PERMANENT THIS CYCLE': 'PERMANENTE NESTE CICLO', 'RESET. REBUILD. ASCEND.': 'REINICIE. RECONSTRUA. ASCENDA.', 'Core synthesis': 'Síntese nuclear', 'Convert this cycle\'s production into Core Shards. Your factory resets, but each shard permanently boosts output.': 'Converta a produção deste ciclo em Fragmentos Nucleares. Sua fábrica será reiniciada, mas cada fragmento aumenta a produção permanentemente.', 'ESTIMATED SHARDS': 'FRAGMENTOS ESTIMADOS', 'Begin synthesis': 'Iniciar síntese', 'LONG-TERM RESEARCH': 'PESQUISA DE LONGO PRAZO', 'UNLOCK · EXPAND · MULTIPLY': 'DESBLOQUEIE · EXPANDA · MULTIPLIQUE', 'Sign in to research persistent technology.': 'Entre para pesquisar tecnologias permanentes.', 'SERVER-OWNED ITEMS': 'ITENS DO SERVIDOR', 'Item inventory': 'Inventário de itens', 'Refresh inventory': 'Atualizar inventário', 'Sign in to view items earned from missions.': 'Entre para ver os itens obtidos em missões.', 'ESCROW ITEM TRADE': 'TROCA DE ITENS EM GARANTIA', 'Trade partner': 'Parceiro de troca', 'Item': 'Item', 'Quantity': 'Quantidade', 'Credits requested': 'Créditos solicitados', 'Create escrow offer': 'Criar oferta em garantia',
  'DISCOVERY PREVIEW': 'PRÉVIA DE DESCOBERTAS', 'Explore what your factory could become. Sign in to save your research.': 'Explore o que sua fábrica pode se tornar. Entre para salvar suas pesquisas.', 'Start here · no earlier discoveries needed': 'Comece aqui · nenhuma descoberta anterior é necessária', 'Find a discovery': 'Encontrar uma descoberta', 'All discoveries': 'Todas as descobertas', 'No discoveries match. Try another search or filter.': 'Nenhuma descoberta corresponde. Tente outra busca ou filtro.', 'Technology tree': 'Árvore tecnológica', 'Choose a branch, unlock new field capabilities, and grow your operation.': 'Escolha uma área, desbloqueie recursos de campo e expanda sua operação.', 'PERSISTENT RESEARCH': 'PESQUISA PERMANENTE', 'Researched': 'Pesquisado', 'Available': 'Disponível', 'Locked by prerequisites': 'Bloqueado por pré-requisitos', 'Hover or focus a node for details': 'Passe o cursor ou foque em um nó para ver detalhes', 'READY TO RESEARCH': 'PRONTO PARA PESQUISAR', 'RESEARCHED': 'PESQUISADO', 'NEED MORE RESOURCES': 'RECURSOS INSUFICIENTES', 'LOCKED': 'BLOQUEADO', 'Foundation node': 'Tecnologia inicial', 'Unlocks alloy': 'Desbloqueia liga metálica', 'Opens quarry zone': 'Abre a zona da pedreira', 'Technology could not be loaded:': 'Não foi possível carregar as tecnologias:', 'Language': 'Idioma', 'Retry': 'Tentar novamente', 'Loading server technology…': 'Carregando tecnologias do servidor…', 'No technology nodes are published yet.': 'Nenhuma tecnologia foi publicada ainda.',
  'Factory': 'Fábrica', 'Robot programming': 'Programação de robôs', 'Give your machines a brain.': 'Dê inteligência às suas máquinas.', 'Build a routine, choose what to collect, then deploy it. Only the actions in the running program affect robot behavior.': 'Monte uma rotina, escolha o que coletar e implante o programa. Apenas as ações programadas afetam o comportamento do robô.', 'VISUAL PROGRAM': 'PROGRAMA VISUAL', 'Run Blockly program': 'Executar programa Blockly', 'Deploy': 'Implantar', 'Entire crew (1)': 'Equipe inteira (1)', 'Customize each bot': 'Personalizar cada robô', 'Choose a bot…': 'Escolha um robô…', 'Choose a branch, unlock new field capabilities, and grow your operation.': 'Escolha uma área, desbloqueie recursos de campo e expanda sua operação.', 'Sign in to sync robot jobs and brain templates.': 'Entre para sincronizar tarefas e programas dos robôs.',
  'COMMUNITY': 'COMUNIDADE', 'PLAYERS HELP PLAYERS': 'JOGADORES AJUDAM JOGADORES', 'Find your people': 'Encontre sua turma', 'Ask for a hand, find a trade, or team up on a project.': 'Peça ajuda, negocie ou forme uma equipe para um projeto.', 'POST TO THE BOARD': 'PUBLICAR NO MURAL', 'Post to community': 'Publicar na comunidade', 'No open transmissions yet. Be the first to post.': 'Ainda não há transmissões. Seja a primeira pessoa a publicar.', 'Sign in to post, reply, offer help, or join a collaboration. You can browse the board without an account.': 'Entre para publicar, responder, oferecer ajuda ou colaborar. Você pode navegar pelo mural sem uma conta.', 'Start something together': 'Comecem algo juntos', 'PILOTS WORKING TOGETHER': 'PILOTOS TRABALHANDO JUNTOS', 'Co-op salvage jobs': 'Expedições cooperativas', 'Contributions needed': 'Contribuições necessárias', 'Complete a server-timed mission to contribute. Contributors split no inventory; each receives a fixed server-wallet reward when the job completes.': 'Complete uma missão cronometrada pelo servidor para contribuir. Os itens não são divididos; cada participante recebe uma recompensa fixa na carteira ao concluir o contrato.',
  'Expeditions': 'Expedições', 'Salvage expeditions': 'Expedições de coleta', 'Send your crew out for scrap. Join a co-op contract to contribute mission completions with other pilots.': 'Envie sua equipe em busca de sucata. Participe de um contrato cooperativo junto com outros pilotos.', 'CURRENT SECTOR': 'SETOR ATUAL', 'AVAILABLE CONTRACT': 'CONTRATO DISPONÍVEL', 'FRONTIER SIGNAL': 'SINAL DA FRONTEIRA', 'Dustline salvage': 'Sucata da Linha de Poeira', 'Rusted relay': 'Relé enferrujado', 'The green vault': 'O cofre verde', 'Recover abandoned alloys from the outer debris field.': 'Recupere ligas abandonadas no campo de destroços.', 'Search a collapsed comms station for usable components.': 'Procure componentes úteis em uma estação de comunicação destruída.', 'An overgrown depot may still have intact machine parts.': 'Um depósito tomado pela vegetação talvez ainda tenha peças intactas.', 'REWARD': 'RECOMPENSA', 'THREAT LOW': 'AMEAÇA BAIXA', 'Scout sector': 'Explorar setor', 'Fight NPC': 'Enfrentar NPC', 'NPC encounter': 'Encontro com NPC', 'ASYNC ROBOT ARENA': 'ARENA ASSÍNCRONA DE ROBÔS', 'RECENT MATCH HISTORY': 'HISTÓRICO RECENTE DE PARTIDAS',
  'FRONTIER ACCOUNT': 'CONTA DA FRONTEIRA', 'Join the crew.': 'Junte-se à equipe.', 'Save a name for your pilot and meet other builders.': 'Escolha um nome para seu piloto e conheça outros construtores.', 'Callsign': 'Nome do piloto', 'Password': 'Senha', '3–20 letters, numbers, _': '3–20 letras, números ou _', 'At least 8 characters': 'Pelo menos 8 caracteres', 'New here? Create an account': 'Novo por aqui? Crie uma conta', 'Already have an account? Sign in': 'Já tem uma conta? Entre', 'Close sign in': 'Fechar login', 'Return to factory': 'Voltar à fábrica', 'This sector isn\'t mapped.': 'Este setor não está mapeado.', 'That route doesn\'t lead anywhere. Head back to a known part of the workshop.': 'Essa rota não leva a lugar algum. Volte para uma área conhecida da oficina.', 'Settings': 'Configurações',
  'Island view': 'Vista da ilha', 'Close-up': 'Aproximar', 'Top view': 'Vista superior', 'Right-drag to pan · pinch to zoom': 'Arraste com o botão direito para mover · pince para ampliar', 'Locked': 'Bloqueado', 'Unlocked': 'Desbloqueado', 'FRONTIER': 'FRONTEIRA', 'QUARRY': 'PEDREIRA', 'First site:': 'Primeiro local:', 'Field zones:': 'Zonas do campo:', 'Moving to resource block': 'Indo até o bloco de recursos', 'Breaking resource block': 'Quebrando bloco de recursos', 'Picking up dropped resource': 'Coletando recurso no chão', 'Returning with mined resources': 'Levando recursos extraídos à base', 'Driving to mouse waypoint': 'Indo até o ponto indicado', 'Manual pilot': 'Controle manual', 'Waypoint reached': 'Ponto alcançado', 'Route blocked; replanning': 'Rota bloqueada; recalculando',
  'No deliveries yet · return cargo to the bay to earn.': 'Ainda sem entregas · retorne à base com a carga para receber recursos.', 'No item trade offers yet.': 'Ainda não há ofertas de troca de itens.', 'No open transmissions yet. Be the first to post.': 'Ainda não há transmissões. Seja a primeira pessoa a publicar.', 'Create job': 'Criar contrato', 'Refresh jobs': 'Atualizar contratos', 'Refresh arena': 'Atualizar arena', 'Refresh': 'Atualizar', 'Save': 'Salvar', 'Show': 'Mostrar', 'OPEN': 'ABERTO', 'VERSION HISTORY': 'HISTÓRICO DE VERSÕES', 'STRUCTURED CONTENT': 'CONTEÚDO ESTRUTURADO', 'ADMINISTRATION': 'ADMINISTRAÇÃO', 'ADMIN ONLY': 'SOMENTE ADMINISTRAÇÃO', 'Catalog editor': 'Editor de catálogo', 'Advanced JSON editor': 'Editor avançado de JSON', 'Apply JSON to structured editor': 'Aplicar JSON ao editor estruturado', 'Validate preview': 'Validar prévia', 'Validate tree': 'Validar árvore', 'Create immutable draft': 'Criar rascunho imutável', '＋ Add node': '＋ Adicionar nó', 'Technology nodes': 'Tecnologias', 'Only administrators can access catalog editing.': 'Somente administradores podem editar o catálogo.', 'Only administrators can edit technology.': 'Somente administradores podem editar tecnologias.',
};

Object.assign(ptBR, {
  'ROBOT AUTOMATION': 'AUTOMAÇÃO DE ROBÔS', 'ROBOT DELIVERIES': 'ENTREGAS DOS ROBÔS',
  'FACTORY CONTRACT · 1 / 4': 'CONTRATO DA FÁBRICA · 1 / 4', 'FACTORY CONTRACT': 'CONTRATO DA FÁBRICA',
  'REWARD': 'RECOMPENSA', 'COMMISSION 1 / 8': 'MARCO 1 / 8', 'SCRAPBOUND / SECTOR 01': 'SCRAPBOUND / SETOR 01',
  'working': 'trabalhando', 'carrying': 'transportando', 'units': 'unidades', 'working ·': 'trabalhando ·',
  'Low': 'Baixa', 'Medium': 'Média', 'High': 'Alta', 'OPEN': 'ABERTO',
  'LOCKED · REQUIRES GEOLOGICAL SURVEY': 'BLOQUEADO · REQUER PESQUISA GEOLÓGICA',
  'Meet your robot buddies!': 'Conheça seus robôs companheiros!',
  'Click a bot in the world to see its brain and what it is doing.': 'Selecione um robô no campo para ver seu programa e atividade.',
  'Specialist brain preset': 'Predefinição de cérebro especialista', 'Load specialist brain': 'Carregar cérebro especialista',
  'Presets use mining, visible drops, cargo capacity, and team support already present in the factory simulation.': 'As predefinições usam mineração, recursos visíveis no chão, capacidade de carga e suporte da equipe já presentes na simulação da fábrica.',
  'Scavenger · cache scout': 'Coletor · explorador de caches', 'Scrap Hound · block breaker': 'Cão de sucata · quebra-blocos',
  'Fabricator · heavy extractor': 'Fabricador · extrator reforçado', 'Sky Miner · alloy prospector': 'Minerador aéreo · prospector de liga',
  'Block Miner · rapid extractor': 'Minerador de blocos · extrator rápido', 'Cargo Hauler · drop sweeper': 'Transportador · coletor de pilhas',
  'Buffer Bot · mining support': 'Robô de suporte · apoio à mineração', 'mine nearest': 'minere o bloco mais próximo de',
  'collect nearest': 'colete a pilha mais próxima de', 'assist a nearby bot for': 'ajude um robô próximo por',
  'if cargo hold is full do': 'se o compartimento estiver cheio, faça', 'if a': 'se houver uma pilha de',
  'seek nearest': 'procure o local mais próximo de', 'site': 'recurso', 'if cargo is at least': 'se a carga estiver em pelo menos',
  '% full do': '% da capacidade, faça', 'if this robot is a': 'se este robô for', 'repeat': 'repita', 'times': 'vezes',
  'drop is waiting do': 'aguardando, faça', 'Add at least one robot action before deploying.': 'Adicione ao menos uma ação de robô antes de implantar.',
  'Follow unit 01': 'Seguir robô 01', '1 / 20 UNITS': '1 / 20 ROBÔS', '0 units': '0 unidades',
  'Scavenger bot': 'Robô coletor', 'Scavenger bot role · local': 'Função de robô coletor · local',
  'General-purpose salvage runner': 'Coletor de sucata versátil', 'Quick salvage specialist': 'Especialista em coleta rápida',
  'Heavy-duty collection unit': 'Unidade de coleta reforçada', 'Fast flying block miner; slow extraction, obstacle-proof flight. · Requires aerial mining': 'Minerador voador rápido; extração lenta e voo que ignora obstáculos. · Requer mineração aérea',
  'Dedicated block miner; fast extraction, cannot haul drops. · Requires quarry boring': 'Minerador de blocos dedicado; extração rápida, não transporta itens. · Requer perfuração da pedreira',
  'Collects mined resource drops and delivers them to the depot. · Requires haul network': 'Coleta recursos extraídos e os entrega no depósito. · Requer rede de transporte',
  'Boosts nearby miners and haulers. · Requires field support': 'Aumenta a eficiência de mineradores e transportadores próximos. · Requer suporte de campo',
  'RESEARCH TO UNLOCK': 'PESQUISE PARA DESBLOQUEAR', 'Reach 1,200 lifetime credits': 'Alcance 1.200 créditos acumulados',
  'Servo tuning': 'Ajuste de servos', 'Robot movement and collection speed +25%.': 'Velocidade de movimento e coleta dos robôs +25%.',
  'Wideband magnet': 'Ímã de banda larga', 'Delivered scrap haul +60%.': 'Carga de sucata entregue +60%.',
  'Smart routing': 'Rotas inteligentes', 'Credits from expeditions +35%.': 'Créditos das expedições +35%.',
  'MAKE IT YOURS': 'PERSONALIZE', 'Buddy style shop': 'Loja de estilos dos robôs',
  'Little extras for your robot friends. Just for fun!': 'Detalhes divertidos para seus robôs companheiros!',
  'BROWSER SAVE · COSMETIC ONLY': 'SALVO NO NAVEGADOR · APENAS COSMÉTICO',
  'Builder cap': 'Capacete de construtor', '12 scrap': '12 sucatas', '20 scrap': '20 sucatas', '30 scrap': '30 sucatas',
  'Get it · 12 ▧': 'Adquirir · 12 ▧', 'Get it · 20 ▧': 'Adquirir · 20 ▧', 'Get it · 30 ▧': 'Adquirir · 30 ▧',
  'Star antenna': 'Antena estelar', 'Rainbow trail': 'Rastro arco-íris', 'Buddy paint': 'Pintura do robô',
  'Paint and decorations never change robot speed or rewards.': 'Pinturas e enfeites não alteram a velocidade nem as recompensas dos robôs.',
  'Creating an offer reserves items. Settlement transfers items and credits atomically; offers expire after 48 hours.': 'Ao criar uma oferta, os itens ficam reservados. A troca transfere itens e créditos de forma atômica; ofertas expiram em 48 horas.',
  'Built for the long haul': 'Feito para durar', 'Follow robot': 'Seguir robô', 'LOCAL SIMULATION · NOT SPENDABLE': 'SIMULAÇÃO LOCAL · NÃO UTILIZÁVEL',
  'ACTIVE SEASON LEAGUE': 'LIGA DA TEMPORADA ATUAL', 'BROWSER SAVE': 'SALVO NO NAVEGADOR', 'COSMETIC ONLY': 'APENAS COSMÉTICO',
  'Find it ·': 'Encontrar ·', 'Open the quarry zone': 'Abrir a zona da pedreira', 'Unlocked': 'Desbloqueado',
  'Geological survey': 'Pesquisa geológica',
  'Open the quarry zone, unlock alloy deposits, increase their spawn weight, and build a survey beacon.': 'Abra a zona da pedreira, desbloqueie depósitos de liga, aumente a chance de encontrá-los e construa um sinalizador de pesquisa.',
  'Field refinery': 'Refinaria de campo',
  'Build a refinery, increase alloy value and site stock, and shorten its restock cycle.': 'Construa uma refinaria, aumente o valor e o estoque de ligas e reduza o tempo de reposição.',
  'Deep veins': 'Veios profundos',
  'Improve the chance of finding alloy deposits across the quarry.': 'Aumente a chance de encontrar depósitos de liga por toda a pedreira.',
  'Sorting rig': 'Esteira de triagem',
  'Recover more value from each delivered alloy load.': 'Obtenha mais valor em cada carga de liga entregue.',
  'Quarry boring': 'Perfuração da pedreira',
  'Unlock a dedicated ground miner for breaking resource blocks.': 'Desbloqueie um minerador terrestre especializado em quebrar blocos de recursos.',
  'Aerial extraction': 'Extração aérea',
  'Unlock the fast flying Skydrill. Its flight is quick, but its small drill extracts slowly.': 'Desbloqueie o Skydrill, um voador veloz. Ele voa rápido, mas sua broca pequena extrai recursos devagar.',
  'Haul network': 'Rede de transporte',
  'Unlock a dedicated logistics bot that collects mined drops and delivers them to the depot.': 'Desbloqueie um robô logístico que coleta os recursos minerados e os leva ao depósito.',
  'Field support array': 'Rede de suporte de campo',
  'Unlock support bots that boost nearby miners and haulers.': 'Desbloqueie robôs de suporte que melhoram mineradores e transportadores próximos.',
  'Remote operations': 'Operações remotas',
  'Keep server-run mining active for one additional hour while you are away.': 'Mantenha a mineração do servidor ativa por mais uma hora enquanto estiver ausente.',
  'Big ideas for little robots': 'Grandes ideias para pequenos robôs',
  'Honeycomb tree': 'Árvore hexagonal', 'Discovery cards': 'Cartões de descoberta',
  'Research completed': 'Pesquisa concluída', 'Search technologies': 'Pesquisar tecnologias', 'Try mining, bots, alloy…': 'Tente mineração, robôs, ligas…',
  'Sign in to research and save this discovery.': 'Entre para pesquisar e salvar esta descoberta.',
  'alloy': 'liga', 'block_miner': 'minerador de blocos', 'sky_miner': 'minerador aéreo',
  'cargo_hauler': 'transportador de carga', 'buffer_bot': 'robô de suporte',
  'survey_beacon': 'sinalizador de pesquisa', 'quarry': 'pedreira',
  'Already researched': 'Já pesquisada',
  'Rookie': 'Iniciante', 'Ready': 'Pronto', 'REWARD · ¢ 30 + ▧ 12': 'RECOMPENSA · ¢ 30 + ▧ 12', 'REWARD ¢ 25 + ▧ 15': 'RECOMPENSA ¢ 25 + ▧ 15',
  'Idle bots? Check their routine and available resource targets.': 'Robôs parados? Verifique a rotina e os recursos disponíveis.',
  'Scrap hound': 'Cão de sucata', 'Auto-fabricator': 'Auto fabricante', 'Quarry borer': 'Perfurador de pedreira', 'Cargo mule': 'Transportador de carga', 'Field buffer': 'Suporte de campo',
  'mint': 'menta', 'berry': 'framboesa', 'sunshine': 'dourado', 'ocean': 'oceano', 'lilac': 'lilás',
});

let activeLocale = DEFAULT_LOCALE;
const textRecords = new WeakMap();
const attributeRecords = new WeakMap();
let observer = null;

function localizedValue(value) {
  if (activeLocale === 'en') return value;
  if (ptBR[value]) return ptBR[value];
  const title = value.match(/^(.*) — Scrapbound$/);
  if (title && ptBR[title[1]]) return `${ptBR[title[1]]} — Scrapbound`;
  const technologyError = value.match(/^Technology could not be loaded: (.+?)(\s+Retry)?$/);
  if (technologyError) return `Não foi possível carregar as tecnologias: ${technologyError[1]}${technologyError[2] ? ` ${ptBR.Retry}` : ''}`;
  const count = value.match(/^(\d+) active units?$/);
  if (count) return `${count[1]} robô${count[1] === '1' ? '' : 's'} ativo${count[1] === '1' ? '' : 's'}`;
  const capacity = value.match(/^(\d+) \/ (\d+) UNITS$/);
  if (capacity) return `${capacity[1]} / ${capacity[2]} ROBÔS`;
  const working = value.match(/^(\d+) \/ (\d+) working$/);
  if (working) return `${working[1]} / ${working[2]} trabalhando`;
  const crewStatus = value.match(/^(\d+) working · (\d+) carrying$/);
  if (crewStatus) return `${crewStatus[1]} trabalhando · ${crewStatus[2]} transportando`;
  const follow = value.match(/^Follow unit (\d+)$/);
  if (follow) return `Seguir robô ${follow[1]}`;
  const botLabel = value.match(/^Bot (\d+) · (.+)$/);
  if (botLabel) return `Robô ${botLabel[1]} · ${ptBR[botLabel[2]] || botLabel[2]}`;
  const unitLabel = value.match(/^UNIT (\d+)$/);
  if (unitLabel) return `ROBÔ ${unitLabel[1]}`;
  const discoverySummary = value.match(/^(\d+) of (\d+) discoveries researched · (\d+) unlocked to explore$/);
  if (discoverySummary) return `${discoverySummary[1]} de ${discoverySummary[2]} descobertas pesquisadas · ${discoverySummary[3]} disponíveis`;
  const prerequisite = value.match(/^Discover first: (.+)$/);
  if (prerequisite) return `Pesquise antes: ${prerequisite[1].split(', ').map(name => ptBR[name] || name).join(', ')}`;
  const nodeLabel = value.match(/^(.+): (RESEARCHED|READY TO RESEARCH|NEED MORE RESOURCES|LOCKED)$/);
  if (nodeLabel) return `${ptBR[nodeLabel[1]] || nodeLabel[1]}: ${ptBR[nodeLabel[2]] || nodeLabel[2]}`;
  const costStatus = value.match(/^(\d+) (credits|scrap) · (select node to research|unlock prerequisite first|insufficient resources)$/);
  if (costStatus) {
    const currency = costStatus[2] === 'credits' ? 'créditos' : 'sucatas';
    const action = { 'select node to research': 'selecione para pesquisar', 'unlock prerequisite first': 'desbloqueie o pré-requisito', 'insufficient resources': 'recursos insuficientes' }[costStatus[3]];
    return `${costStatus[1]} ${currency} · ${action}`;
  }
  const multiplier = value.match(/^([a-z_]+) (spawn|value|stock|restock time) ×(.+)$/);
  if (multiplier) {
    const kind = { spawn: 'chance de encontrar', value: 'valor', stock: 'estoque', 'restock time': 'tempo de reposição' }[multiplier[2]];
    return `${ptBR[multiplier[1]] || multiplier[1]} · ${kind} ×${multiplier[3]}`;
  }
  const unlock = value.match(/^Unlocks ([a-z_ ]+) (bot|program|module)$/);
  if (unlock) {
    const term = unlock[1].trim();
    const localizedTerm = ptBR[term] || ptBR[term.replaceAll(' ', '_')] || term;
    return `Desbloqueia ${unlock[2] === 'bot' ? 'robô ' : unlock[2] === 'program' ? 'programa ' : 'módulo '}${localizedTerm}`;
  }
  const enables = value.match(/^Enables ([a-z_ ]+)$/);
  if (enables) {
    const term = enables[1].trim();
    return `Habilita ${ptBR[term] || ptBR[term.replaceAll(' ', '_')] || term}`;
  }
  const builds = value.match(/^Builds ([a-z_ ]+)$/);
  if (builds) {
    const term = builds[1].trim();
    return `Constrói ${ptBR[term] || ptBR[term.replaceAll(' ', '_')] || term}`;
  }
  if (value === '✓ COMPLETE') return '✓ CONCLUÍDA';
  const researchToast = value.match(/^(.+) researched\. New world content is active\.$/);
  if (researchToast) return `${ptBR[researchToast[1]] || researchToast[1]} pesquisada. O novo conteúdo já está ativo.`;
  return value;
}

function localizeTextNode(node) {
  const current = node.nodeValue || '';
  const record = textRecords.get(node);
  const value = record && current === record.localized ? record.original : current;
  const trimmed = value.trim();
  if (!trimmed) return;
  const leading = value.slice(0, value.indexOf(trimmed));
  const trailing = value.slice(value.indexOf(trimmed) + trimmed.length);
  const localized = localizedValue(trimmed);
  const nextValue = `${leading}${localized}${trailing}`;
  if (nextValue === current) return;
  textRecords.set(node, { original: value, localized: nextValue });
  node.nodeValue = nextValue;
}

function localizeAttribute(element, name) {
  const attributes = attributeRecords.get(element) || new Map();
  const current = element.getAttribute(name);
  if (current === null) return;
  const record = attributes.get(name);
  const original = record && current === record.localized ? record.original : current;
  const localized = localizedValue(original);
  if (current !== localized) element.setAttribute(name, localized);
  attributes.set(name, { original, localized });
  attributeRecords.set(element, attributes);
}

function localizeNode(root) {
  if (root.nodeType === Node.TEXT_NODE) { localizeTextNode(root); return; }
  if (root.nodeType !== Node.ELEMENT_NODE && root !== document) return;
  if (root.nodeType === Node.ELEMENT_NODE) {
    for (const name of ['title', 'placeholder', 'aria-label']) localizeAttribute(root, name);
  }
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) localizeTextNode(walker.currentNode);
}

export function getLocale() { return activeLocale; }

export function translateText(value) { return localizedValue(String(value ?? '')); }

export function formatNumber(value, options = {}) {
  return new Intl.NumberFormat(activeLocale, options).format(value);
}

export function formatDate(value, options = {}) {
  return new Intl.DateTimeFormat(activeLocale, options).format(value instanceof Date ? value : new Date(value));
}

export function setLocale(locale) {
  activeLocale = locale === 'en' ? 'en' : DEFAULT_LOCALE;
  try { localStorage.setItem(STORAGE_KEY, activeLocale); } catch {}
  document.documentElement.lang = activeLocale;
  const picker = document.getElementById('language-select');
  if (picker) picker.value = activeLocale;
  localizeNode(document);
  document.dispatchEvent(new CustomEvent('scrapbound-locale-change', { detail: { locale: activeLocale } }));
}

export function installI18n() {
  let savedLocale = null;
  try { savedLocale = localStorage.getItem(STORAGE_KEY); } catch {}
  activeLocale = savedLocale === 'en' ? 'en' : DEFAULT_LOCALE;
  document.documentElement.lang = activeLocale;
  const picker = document.getElementById('language-select');
  if (picker) {
    picker.value = activeLocale;
    picker.addEventListener('change', () => setLocale(picker.value));
  }
  localizeNode(document);
  observer?.disconnect();
  observer = new MutationObserver(records => {
    for (const record of records) {
      if (record.type === 'characterData') localizeTextNode(record.target);
      for (const node of record.addedNodes || []) localizeNode(node);
      if (record.type === 'attributes') localizeAttribute(record.target, record.attributeName);
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['title', 'placeholder', 'aria-label'] });
}
