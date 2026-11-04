/* Leeds prototyping CMS - default site, page templates and sample pages */
(function () {
  'use strict';

  var PH = 'https://designsystem.leeds.ac.uk/placeholders/';

  function id(prefix) { return (prefix || 'id') + '_' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4); }

  function block(type, props) {
    var p = window.UOL_BLOCKS.defaultsFor(type);
    Object.assign(p, props || {});
    return { id: id('blk'), type: type, props: p };
  }

  var SITE = {
    name: 'University of Leeds',
    homeUrl: 'https://leeds.ac.uk',
    masthead: {
      showQuicklinks: true,
      showSearch: true,
      searchLabel: 'Search leeds.ac.uk',
      searchAction: 'https://www.leeds.ac.uk/search',
      quicklinks: [
        { label: 'Current students', links: [{ label: 'Minerva', href: 'https://minerva.leeds.ac.uk' }, { label: 'Mobile app', href: 'https://students.leeds.ac.uk/uniLeeds' }, { label: 'Website for current students', href: 'https://students.leeds.ac.uk' }] },
        { label: 'Staff', links: [{ label: 'Staff intranet', href: 'https://forstaff.leeds.ac.uk' }, { label: 'Services A-Z', href: 'https://forstaff.leeds.ac.uk/services-a-z' }, { label: 'Jobs', href: 'https://jobs.leeds.ac.uk' }] },
        { label: 'Faculties', links: [{ label: 'Faculties', href: 'https://www.leeds.ac.uk/faculties' }, { label: 'Faculty contacts', href: 'https://www.leeds.ac.uk/faculty-contacts' }] },
        { label: 'Alumni', links: [{ label: 'Alumni website', href: 'https://alumni.leeds.ac.uk' }] }
      ]
    },
    localMasthead: { enabled: false, parentTitle: '', parentHref: '/', title: 'Faculty of Engineering and Physical Sciences', href: '/' },
    navigation: {
      enabled: true,
      items: [
        { label: 'Home', href: '/' },
        { label: 'Study', href: '/study', children: [{ label: 'Undergraduate', href: '/undergraduate' }, { label: 'Masters', href: '/masters' }, { label: 'Research degrees', href: '/research-degrees' }, { label: 'International students', href: '/international' }, { label: 'Online courses', href: '/online' }, { label: 'Search courses', href: '/courses', cta: true }, { label: 'Open days and visits', href: '/open-days', cta: true }] },
        { label: 'Research and innovation', href: '/research' },
        { label: 'Business and partnerships', href: '/business' },
        { label: 'Around campus', href: '/campus' },
        { label: 'Give to Leeds', href: '/give' },
        { label: 'About', href: '/about' }
      ]
    },
    globalBanner: { enabled: false, title: 'Open days 2026', description: 'Be the first to know when bookings open for our autumn open days.', buttonLabel: 'Register your interest', buttonHref: '#' },
    marketingBanner: { enabled: false, title: 'Autumn open days', description: 'Find out about our courses and campus facilities and get a taste of student life.', linkLabel: 'Register your interest', linkHref: '#' },
    footer: {
      navGroups: [
        { title: 'Study and courses', links: [{ label: 'Undergraduate', href: '/undergraduate' }, { label: 'Masters courses', href: '/masters' }, { label: 'Research degrees', href: '/research-degrees' }, { label: 'International', href: '/international' }, { label: 'Course search', href: '/courses' }] },
        { title: 'About us', links: [{ label: 'Campus map', href: '#' }, { label: 'Our history', href: '#' }, { label: 'Faculties', href: '#' }, { label: 'Governance', href: '#' }, { label: 'Reports, accounts and policies', href: '#' }, { label: 'Strategies and values', href: '#' }, { label: 'Equality', href: '#' }, { label: 'Executive team', href: '#' }, { label: 'News', href: '#' }, { label: 'Events', href: '#' }] },
        { title: 'Quicklinks and contacts', links: [{ label: 'Jobs', href: '#' }, { label: 'Term dates', href: '#' }, { label: 'Services A-Z', href: '#' }, { label: 'Library', href: '#' }, { label: 'Alumni', href: '#' }, { label: 'Media relations', href: '#' }, { label: 'Staff A-Z', href: '#' }, { label: 'Contacts', href: '#' }, { label: 'Leeds University Union', href: '#' }] }
      ],
      contact: { title: 'Contact information', name: 'University of Leeds', street: 'Woodhouse Lane', locality: 'Leeds', region: 'West Yorkshire', postcode: 'LS2 9JT', country: 'United Kingdom', phone: '+44 0113 243 1751', email: '' },
      social: [
        { network: 'youtube', href: 'https://www.youtube.com/user/universityofleedsuk' },
        { network: 'twitter', label: 'X', href: 'https://twitter.com/UniversityLeeds' },
        { network: 'instagram', href: 'https://www.instagram.com/universityofleeds/' },
        { network: 'linkedin', href: 'https://www.linkedin.com/school/7244' },
        { network: 'facebook', href: 'https://www.facebook.com/universityofleeds/' },
        { network: 'tiktok', href: 'https://www.tiktok.com/@universityofleeds' },
        { network: 'weibo', href: 'https://www.weibo.com/leedsuniversityuk' }
      ],
      accreditations: [],
      siteInfo: { copyright: '© 2026 University of Leeds', links: [{ label: 'Privacy', href: '#' }, { label: 'Accessibility', href: '#' }, { label: 'Terms and conditions', href: '#' }, { label: 'Freedom of information', href: '#' }, { label: 'Modern slavery statement', href: '#' }] },
      supplement: { enabled: false, label: 'Contact us', href: '#', icon: 'mdiPhoneOutline' }
    },
    theme: { tokens: {}, fontSans: '', fontSerif: '', baseFontSize: '100%', customCss: '', loadTypekit: true }
  };

  function emptySettings(extra) {
    return Object.assign({
      navActive: '',
      breadcrumb: [],
      heading: { title: '', subtitle: '', category: '', categoryHref: '', date: '', hide: false },
      leadParagraph: true,
      inPageNav: { enabled: false, style: 'list', title: 'Contents', items: [] },
      sectionNav: { enabled: false, intro: 'In this section', title: '', items: [] },
      relatedContent: { enabled: false, title: 'Related content', items: [] },
      sectionCtas: { enabled: false, title: '', links: [] },
      pageNav: { enabled: false, prevLabel: '', prevHref: '', nextLabel: '', nextHref: '' },
      hiddenTitle: '',
      articleKind: 'news',
      featuredImage: { src: '', alt: '', caption: '' }
    }, extra || {});
  }

  /* Starting points for "New page" */
  window.UOL_PAGE_TEMPLATES = {
    homepage: function (title) {
      return { template: 'homepage', title: title || 'Homepage', settings: emptySettings({ navActive: '/', hiddenTitle: (title || 'Site') + ' home page' }), hero: { type: 'banner', items: [{ title: 'Welcome to ' + (title || 'our site'), image: PH + 'banner/banner-01.jpg', alt: 'University campus', lead: 'A short lead sentence for the banner.', linkLabel: 'Find out more', linkHref: '#' }] }, blocks: [block('ctas'), block('tiles'), block('news-events')] };
    },
    document: function (title) {
      return { template: 'document', title: title || 'New page', settings: emptySettings({ breadcrumb: [{ label: 'Home', href: '/' }] }), hero: { type: 'none' }, blocks: [block('rich-text', { html: '<p>This is a lead paragraph. It introduces the page in one or two sentences.</p><p>Body text follows. Replace this with your content, or add more blocks below.</p>' })] };
    },
    article: function (title) {
      return { template: 'article', title: title || 'News article', settings: emptySettings({ breadcrumb: [{ label: 'News', href: '/news' }], heading: { title: '', subtitle: '', category: 'News', categoryHref: '/news', date: new Date().toISOString().slice(0, 10) }, featuredImage: { src: PH + 'tiles/space.jpg', alt: 'Night sky filled with stars', caption: '' } }), hero: { type: 'none' }, blocks: [block('rich-text', { html: '<p>The opening paragraph of the article.</p><p>Further paragraphs follow.</p>' })] };
    },
    blank: function (title) {
      return { template: 'document', title: title || 'Blank page', settings: emptySettings(), hero: { type: 'none' }, blocks: [] };
    }
  };

  /* Sample content that ships with the CMS */
  window.UOL_SEED = function () {
    var home = {
      id: id('page'), slug: 'home', title: 'University of Leeds', template: 'homepage', status: 'published',
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), revisions: [],
      settings: emptySettings({ navActive: '/', hiddenTitle: 'University of Leeds home page' }),
      hero: {
        type: 'banner',
        items: [
          { title: 'Shape the world you want', image: PH + 'banner/banner-01.jpg', alt: 'Students walking across campus', lead: 'Join a world top 100 university in the heart of a vibrant northern city.', linkLabel: 'Explore our courses', linkHref: '/undergraduate' },
          { title: 'Campus tours', image: PH + 'banner/banner-02.jpg', alt: 'The Parkinson building', lead: 'See the campus for yourself on a student-led tour.', linkLabel: 'Book your tour', linkHref: '/open-days' },
          { title: 'Research that changes lives', image: PH + 'banner/banner-03.jpg', alt: 'Researcher in a laboratory', lead: 'From climate science to medical technology, our research shapes a better future.', linkLabel: 'Explore research', linkHref: '/research' }
        ]
      },
      blocks: [
        block('ctas', { items: [{ title: 'Explore Leeds', href: '/campus', text: 'Discover our campus, the city and student life.' }, { title: 'Your career', href: '#', text: 'Award-winning careers support for every student.' }, { title: 'Scholarships', href: '#', text: 'Find out about funding to support your studies.' }, { title: 'Postgraduate virtual open day', href: '#', text: 'Join us online to find out about masters study.' }] }),
        block('facts-figures', { title: 'Our rankings', items: [{ headline: 'Top 100', text: 'world ranking university', source: 'QS World University Rankings 2025', sourceHref: 'https://example.com' }, { headline: 'Top 10', text: 'most targeted university by graduate employers', source: 'High Fliers 2025' }, { headline: '18th', text: 'in the UK', source: 'The Times and Sunday Times Good University Guide 2025' }, { headline: 'Top 10', text: 'for research power', source: 'REF 2021' }] }),
        block('featured-content', { title: 'Introducing Leeds', lead: 'Hear what our students say about studying and living in Leeds.', media: 'video', videoUrl: 'https://www.youtube.com/watch?v=j4pt8l7e3u8', videoTitle: 'Introducing Leeds', image: PH + 'banner/banner-04.jpg', text: '<p>Every year more than 6,000 international students choose to study with us, making our campus one of the most diverse and multicultural in the UK.</p>' }),
        block('tiles', { title: 'Life at Leeds', lead: 'Our students on what makes Leeds special.', linkLabel: 'Chat to students', linkHref: '#' }),
        block('image-quote'),
        block('cards', { title: 'Research and innovation', lead: 'World-leading research to shape a better future.', linkLabel: 'Explore research', linkHref: '/research', cards: [{ title: 'Climate and energy', href: '#', text: 'Tackling the climate crisis through science, engineering and policy.', image: PH + 'tiles/background.jpg', alt: 'Aerial view of a river' }, { title: 'Health and medicine', href: '#', text: 'From early cancer detection to rehabilitation technology.', image: PH + 'ph-news-02.jpg', alt: 'Runners' }, { title: 'Culture and society', href: '#', text: 'Understanding and shaping the world we live in.', image: PH + 'tiles/cloth-workers-court.jpg', alt: 'Cloth workers court' }] }),
        block('news-events'),
        block('events'),
        block('navigation-cards')
      ]
    };

    var about = {
      id: id('page'), slug: 'about', title: 'About the University', template: 'document', status: 'published',
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), revisions: [],
      settings: emptySettings({
        navActive: '/about',
        breadcrumb: [{ label: 'Home', href: '/' }],
        heading: { title: 'About the University', subtitle: 'Our history, values and strategy', category: '', categoryHref: '', date: '' },
        inPageNav: { enabled: true, style: 'list', title: 'Contents', items: [{ label: 'Our history', href: '/about', current: true }, { label: 'Strategy and values', href: '/about-strategy' }, { label: 'Executive team', href: '/about-executive' }, { label: 'Governance', href: '/about-governance' }] },
        sectionNav: { enabled: true, intro: 'In this section', title: 'About', items: [{ label: 'Overview', href: '/about', current: true }, { label: 'Our history', children: [{ label: 'Timeline', href: '#' }, { label: 'Heritage buildings', href: '#' }] }, { label: 'Strategy and values', href: '#' }, { label: 'Executive team', href: '#' }, { label: 'Governance', href: '#' }, { label: 'Reports and policies', href: '#' }] },
        relatedContent: { enabled: true, title: 'Related content', items: [{ title: 'Meet our students', href: '#', text: 'Hear from some of our undergraduates about the exciting things they have done.' }, { title: 'Admissions enquiries', phone: '+44 (0)113 343 2336', email: 'study@leeds.ac.uk' }] },
        sectionCtas: { enabled: true, title: 'Discover Leeds', links: [{ label: 'Open days', href: '#' }, { label: 'Visit us', href: '#' }, { label: 'Virtual campus tour', href: '#' }] },
        pageNav: { enabled: true, prevLabel: '', prevHref: '', nextLabel: 'Strategy and values', nextHref: '#' }
      }),
      hero: { type: 'none' },
      blocks: [
        block('rich-text', { html: '<p>Founded in 1904, the University of Leeds is one of the largest universities in the UK, with more than 38,000 students from over 170 countries.</p><p>We are a member of the Russell Group of research-intensive universities and a founding member of the Worldwide Universities Network. Our campus is a ten minute walk from the centre of Leeds, one of the UK\'s largest and most diverse cities.</p>' }),
        block('status-message', { kind: 'info', text: 'This page is a <strong>prototype</strong> built with the Leeds design system.' }),
        block('heading', { text: 'Our history', level: '2' }),
        block('rich-text', { html: '<p>The University traces its origins to the Leeds School of Medicine, founded in 1831, and the Yorkshire College of Science, founded in 1874. It received its Royal Charter in 1904.</p>' }),
        block('image', { src: PH + 'tiles/parkinson.jpg', alt: 'The Parkinson building', caption: 'The Parkinson building, completed in 1951' }),
        block('pull-quote', { text: 'A community of 38,000 students from more than 170 countries.' }),
        block('accordion', { level: '3', items: [{ title: 'Faculty of Arts, Humanities and Cultures', content: '<p>Home to schools including Design, English, Fine Art, History, Languages, Media and Communication, Music, Performance and Cultural Industries, and Philosophy, Religion and History of Science.</p>' }, { title: 'Faculty of Biological Sciences', content: '<p>Biology, biomedical sciences, molecular and cellular biology, and sport and exercise sciences.</p>' }, { title: 'Faculty of Engineering and Physical Sciences', content: '<p>Chemical and process engineering, chemistry, civil engineering, computing, electronic and electrical engineering, mathematics, mechanical engineering, and physics and astronomy.</p>' }] }),
        block('in-text-facts', { title: 'Leeds in numbers', items: [{ title: '38,000+', description: 'students' }, { title: '170+', description: 'countries represented' }, { title: '1904', description: 'Royal Charter granted', href: '#' }] }),
        block('table', { caption: 'Student numbers 2025/26', headers: 'Level | Students', rows: 'Undergraduate | 26,500\nTaught postgraduate | 8,900\nResearch postgraduate | 3,100' }),
        block('in-text-cta', { arrow: true, items: [{ title: 'Read our strategy', href: '#', text: 'Universal values, global change: our strategy to 2030.' }, { title: 'Our executive team', href: '#', text: 'Meet the people who lead the University.' }] }),
        block('linked-list', { items: [{ label: 'Faculty of Arts, Humanities and Cultures', href: '#' }, { label: 'Faculty of Biological Sciences', href: '#' }, { label: 'Faculty of Business', href: '#' }, { label: 'Faculty of Engineering and Physical Sciences', href: '#' }, { label: 'Faculty of Environment', href: '#' }, { label: 'Faculty of Medicine and Health', href: '#' }, { label: 'Faculty of Social Sciences', href: '#' }] }),
        block('link-buttons', { buttons: [{ label: 'Contact us', href: '#', style: 'primary' }, { label: 'Campus map', href: '#', style: '' }] })
      ]
    };

    var article = {
      id: id('page'), slug: 'news-space-research', title: 'Space research aims to boost Yorkshire economy', template: 'article', status: 'published',
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), revisions: [],
      settings: emptySettings({
        navActive: '/research',
        breadcrumb: [{ label: 'News', href: '/news' }],
        heading: { title: '', subtitle: '', category: 'Environment', categoryHref: '/news', date: '2026-10-07' },
        featuredImage: { src: PH + 'tiles/space.jpg', alt: 'Night sky filled with stars', caption: '' }
      }),
      hero: { type: 'none' },
      blocks: [
        block('rich-text', { html: '<p>The University is to help spearhead a national programme of technological revolution backed by the UK Space Agency.</p><p>World-leading research in climate change, space and planetary science, navigation and transport is already carried out at Leeds. Academics are working on global issues ranging from air quality and weather forecasting to flood alerts, earthquakes and polar glaciers.</p>' }),
        block('pull-quote', { text: 'It aims to identify existing industry strengths while unearthing challenges and knowledge gaps to develop a strong and sustainable space hub.' }),
        block('rich-text', { html: '<p>Now that expertise will underpin an ambitious programme which aims to bring together development and investment in new digital and space-related technology.</p><h2>Further information</h2><p>For further details, contact the University of Leeds press office.</p>' }),
        block('article-highlight')
      ]
    };

    return { site: JSON.parse(JSON.stringify(SITE)), pages: [home, about, article] };
  };

  window.UOL_SEED_SITE = function () { return JSON.parse(JSON.stringify(SITE)); };
})();
