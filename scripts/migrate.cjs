require('../lib/db.cjs').migrate().then(()=>{console.log('Estrutura de opções pronta.');process.exit(0)}).catch(e=>{console.error(e.code||'migration_failed');process.exit(1)});
