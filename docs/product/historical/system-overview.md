Projeto: Kelp Tutoring Platform

Status: Early Development – Phase 1 (Core Infrastructure)

Início atualização: 2026-03-08



1\. Visão Geral do Projeto

Kelp Tutoring é uma plataforma educacional integrada projetada para fornecer:

1.a) trilhas de aprendizagem personalizadas

1.b) prática estruturada (estilo IXL)

1.c) acompanhamento humano por professores e mentores

1.d) organização pedagógica semanal

1.e) centralização de ferramentas educacionais



O objetivo é eliminar a fragmentação de ferramentas normalmente usadas em tutoria online (Google Classroom, Miro, Forms, planilhas etc.) e concentrar tudo em um único ambiente.



A plataforma combina:



\- conteúdo estruturado

\- acompanhamento pedagógico

\- metodologia ativa de ensino

\- dados educacionais rastreáveis





2\. Produtos e Proposta Comercial



O modelo comercial é modular.



O aluno pode contratar diferentes níveis de suporte pedagógico.



\- Produto base



Nivelamento + Curadoria de Material



Inclui:



2.a) diagnóstico inicial

2.b) organização da trilha pedagógica

2.c) acesso ao cronograma personalizado

2.d) recomendação de materiais

2.e) acesso às ferramentas da plataforma



2.1 Pacotes com aulas



O aluno pode contratar pacotes adicionais de aulas.



Exemplos:



2.1.a) Nivelamento + curadoria

2.1.b) Nivelamento + curadoria + 4 aulas

2.1.c) Nivelamento + curadoria + 8 aulas

2.1.d) Nivelamento + curadoria + 12 aulas

2.1.e) Nivelamento + curadoria + 16 aulas



Dois modelos de acompanhamento



2.2 Acompanhamento semanal (produto âncora)



2.2.a) aula semanal

2.2.b) trilha pedagógica organizada

2.2.c) metodologia ativa

2.2.d) comunicação positiva



2.3 Aulas sob demanda



2.3.a) foco em resolução de dúvidas

2.3.b) aluno envia formulário antes da aula

2.3.c) professor prepara a sessão



3\. Objetivos do Sistema



A plataforma tem quatro objetivos principais.



3.1 Organização pedagógica



Oferecer uma trilha clara e previsível para o aluno.



Cada aluno possui:



3.1.a) cronograma semanal

3.1.b) objetivos de estudo

3.1.c) materiais recomendados

3.1.d) atividades de prática



3.2 Ferramenta integrada para professores



O sistema substitui várias ferramentas externas:



3.2.a) Google Classroom

3.2.b) Miro

3.2.c) Google Forms

3.2.d) planilhas dispersas



3.3 Prática estruturada estilo IXL



O sistema incluirá prática baseada em itens pedagógicos.



Cada item possui:



3.3.a) um tópico específico

3.3.b) um conjunto de 30–50 questões

3.3.c) seleção aleatória de exercício

3.3.d) registro de progresso



3.4 Rastreamento pedagógico



O sistema registra:



3.4.a) resultados de atividades

3.4.b) tempo gasto

3.4.c) progresso do aluno

3.4.d) notas de aula

3.4.e) histórico pedagógico



3.5 Ferramentas Utilizadas



Infraestrutura principal do sistema.



> Backend / Database



3.5.1 Supabase



Usado para:



\- banco de dados

\- autenticação

\- storage

\- APIs



> Versionamento



3.5.2 GitHub



Usado para:



\- controle de versão

\- documentação

\- organização do desenvolvimento



> Domínio e DNS



3.5.3 GoDaddy



Responsável por:



\- domínio

\- registros DNS

\- apontamento para hosting



4\. Papéis e Controle de Acesso



A plataforma possui quatro níveis de acesso.



4.a) Student



Pode:

4.a.1) visualizar cronograma semanal

4.a.2) acessar materiais indicados

4.a.3) realizar atividades

4.a.4) visualizar resultados

4.a.5) enviar mensagens

4.a.6) participar do fórum de dúvidas

4.a.7) agendar aulas

4.a.7) acessar histórico pedagógico



Não pode:



4.a.8) alterar trilha pedagógica

4.a.9) acessar banco de questões



4.b) Teacher



\- Responsável pela execução pedagógica.



Pode:



4.b.1) visualizar alunos atribuídos

4.b.2) acessar cronograma completo

4.b.3) atribuir tarefas

4.b.4) alterar deadlines

4.b.5) enviar mensagens

4.b.6) responder dúvidas públicas

4.b.7) registrar notas de aula

4.b.8) elaborar relatórios pedagógicos



Não pode:



4.b.9) editar banco de questões

4.b.10) criar itens pedagógicos



4.c) Mentor



\- Responsável pela estrutura pedagógica.



Pode:



4.c.1) acessar professores sob sua supervisão

4.c.2) acessar alunos desses professores

4.c.3) realizar triagem de alunos

4.c.4) criar itens de prática

4.c.5) criar provas

4.c.6) acessar banco de questões

4.c.7) estruturar trilhas pedagógicas

4.c.8) Também pode lecionar.



4.d) Admin



\- Acesso completo ao sistema.



5\. Arquitetura do Sistema



O sistema é organizado em módulos.



Principais componentes:



5.a) Authentication

5.b) login

5.c) roles

5.d) sessões

5.e) Dashboards

5.f) student dashboard

5.g) teacher dashboard

5.h) mentor dashboard

5.i) admin dashboard

5.j) Learning Path / Schedule

5.k) Coração do sistema.



6\. Cada aluno possui um cronograma semanal contendo:



6.a) tópicos de estudo

6.b) links externos

6.c) atividades internas

6.d) recursos recomendados;



Exemplos de recursos:



\- exercícios internos

\- IXL

\- OpenStax: seções relacionadas ao tópico

\- vídeos relacionados ao tópico

\- simuladores (PhET e similares) relacionados ao tópico



> Activity Engine



7\. Sistema de atividades.



Inclui:



\- prática por item

\- simulados

\- testes de nivelamento

\- tarefas



> Question Bank



Banco de questões centralizado.



7.1 Questões são classificadas por:



7.1.a) disciplina

7.1.b) tópico

7.1.c) subtópico

7.1.d) dificuldade

7.1.e) tipo de avaliação

7.1.f) Practice Items



\- Unidades pedagógicas inspiradas no IXL.



7.2 Cada item possui:



7.2.a) tópico específico

7.2.b) pool de questões

7.2.c) geração aleatória

7.2.d) registro de desempenho

7.2.e) Results Tracking



7.3 Sistema registra:



7.3.a) respostas

7.3.b) tempo gasto

7.3.c) score

7.3.d) tipo de atividade



7.4 Etiquetas possíveis:



7.4.a) practice

7.4.b) assignment

7.4.c) mock

7.4.d) exam

7.4.e) SAT

7.4.f) ACT



8\. Whiteboard



Ferramenta de aula integrada.



Funciona como:



8.a) quadro branco colaborativo

8.b) espaço de resolução de problemas

8.c) suporte para metodologia ativa



Após a aula:



8.a) professor preenche notas de aula

8.b) dados são armazenados no sistema

8.c) dados podem ser exportados para análise



9\. Lesson Booking



> Sistema de agendamento de aulas.



Regras iniciais:



9.a) máximo 2 aulas por semana

9.b) aulas não podem ocorrer em dias consecutivos

9.c) pacotes possuem validade



10\. Disciplinas Cobertas



Inicialmente o sistema cobrirá:



10.a) Álgebra

10.b) Aritmética

10.c) Geometria

10.d) Trigonometria

10.e) Probabilidade

10.f) Física

10.g) Pré-cálculo



11\. Referências de Mercado



Plataformas analisadas durante o desenvolvimento.



11.1 IXL



Referência para:



11.1.a) prática por item

11.1.b) estrutura de habilidades

11.1.c) progress tracking



11.2 Preply



Referência para:



11.2.a) agendamento de aulas



11.3 LatinHire



Referência para:



11.3.a) contratação de professores

11.3.b) operação internacional



11.4 Tutor.com



Referência para:



11.4.a) estrutura de tutoria online

11.4.b) fluxo de atendimento educacional

11.4.c) estrutura administrativa



12\. Identidade Visual



A identidade visual atual utiliza:



12.a) Fonte: Inter

12.b) Cores principais

\- Primary (Kelp Green) #5FAE63

\- Secondary (Cyan) #00ACC1

\- Background #fafafa

\- Text #212121



> Essas definições estão implementadas no CSS do projeto.



13\. Status Atual do Projeto



Etapa atual: Fase 1 — Infraestrutura inicial



Já foi feito:



13.a) definição da arquitetura do sistema

13.b) definição de papéis e permissões

13.c) definição do modelo pedagógico

13.d) estrutura de diretórios do projeto

13.e) implementação inicial da landing page

13.f) implementação inicial da página de login

13.g) criação do repositório GitHub

13.h) definição da identidade visual



14\. Próximos Passos (Fase 1)



Objetivo: tornar a plataforma funcional.



Prioridades:



14.a) Login funcional

14.b) Sistema de autenticação

14.c) Controle de roles

14.d) Dashboards básicos

14.e) Estrutura de cronograma do aluno

14.f) Estrutura inicial de prática por item

14.g) Sistema de resultados



15\. Observações



15.a) A plataforma está sendo construída com foco em:

15.b) escalabilidade pedagógica

15.c) reutilização de conteúdo

15.d) coleta de dados educacionais

15.e) integração de ferramentas

15.f) experiência de aprendizado estruturada





\## Dev Log 2026-03-09

\- Estrutura completa do sistema definida

\- Arquitetura de roles finalizada

\- Documento system-overview criado

