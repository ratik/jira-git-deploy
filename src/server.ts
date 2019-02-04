import * as Koa from 'koa';
import * as Router from 'koa-router';
import * as bodyParser from 'koa-bodyparser';
import * as _ from 'lodash';
import * as fs from 'fs';
import * as views from 'koa-views-templates';
import { Docker } from 'node-docker-api';
const aha = require('aha');

const docker = new Docker({ socketPath: '/var/run/docker.sock' });

interface ContainerData {
	State: string,
	Names: string[]
};

interface ContainerBranches {
	name: string,
	branches: string[],
	container: Object
};
interface requestAnswer {
    way: string,
    action: string,
    tasks: string
}

const promisifyStream = (stream, pretty) => new Promise((resolve, reject) => {
  let data = '';
  stream.on('data', d => data += d.toString());
  stream.on('end', () => resolve(data.trim()))
  stream.on('error', reject);
});

const execCommandInContainer = async (container, command: string, Detach = false, pretty = true) => {
    let data = '';
    if (pretty) {
	data+= `\n\n<b>$[${container.data.Names[0]}] ${command}</b>\n`;
    }
    const exec = await container.exec.create({
    	    AttachStdout: !Detach,
    	    AttachStderr: !Detach,
    	    Cmd: command.split(' ')
    });
    const stream = await exec.start({ Detach });
    data += <string> await promisifyStream(stream, pretty);
    return data;
}

const getContainers = async () => {
    const myNames:string[] = (process.env.GIT_CONTAINERS || "").split(' ').map(v => "/" + v);
    const containers = await docker.container.list();
    let out: any[] = [];
    for(const container of containers) {
	const {State, Names} = <ContainerData>container.data;
	if (State === "running") {
	    if(myNames.includes(Names[0])) {
		const data = await execCommandInContainer(container, "git branch -r", false, false);
		const branches = data.split("\n").map(v => v.trim());
		out.push({
		    container,
		    branches
		});
	    }
	}
    }
    return out;
}

const app = new Koa();

app.use(views(`${__dirname}/../templates/`, { map: {html: 'lodash' }}));

app.use(bodyParser({
  onerror: function (err, ctx) {
    ctx.throw('body parse error', 422);
  }
}));

app.use(async (ctx, next) => {
    await next();
});

const router = new Router();

const deploy = async (containerName, tasks) => {
    const containers = await getContainers();
    let temp = '';
    for(const one of containers) {
	if (one.container.data.Names[0] !== `/webtycoon-${containerName}`) {
	    continue;
	}
	console.log(`deploy start /webtycoon-${containerName}`);
	let restart = true;
	temp += await execCommandInContainer(one.container, "git reset --merge");
	temp += await execCommandInContainer(one.container, "git checkout master");
	temp += await execCommandInContainer(one.container, "git pull origin");
	temp += await execCommandInContainer(one.container, "git branch -D tempRC");
	temp += await execCommandInContainer(one.container, "git checkout -b tempRC");
	if (tasks.length) {
	    for(const task of tasks) {
		const branch = one.branches.find(v => v.match(new RegExp(task.replace('-','-*'),'gi')));
		if (branch){
		    const x= await execCommandInContainer(one.container, `git merge ${branch}`);
		    temp += x;
		    if (x.match(/Automatic merge failed/gi)) {
			restart = false;
		    }
		}
	    }
	}
	if (restart) {
	    if (process.env.RESTART_ON_SUCCESS === 'true') {
		temp += await execCommandInContainer(one.container, "sh restart.sh", true);
	    }
	} else {
	    temp += await execCommandInContainer(one.container, "git diff --name-status --diff-filter=U");
	    temp += await execCommandInContainer(one.container, "git --no-pager diff --diff-filter=U");
	}
    }
    return `<pre>${temp}</pre>`;
};

router.get('/main/:name', async(ctx) => {
  const file = `${ctx.params.name}.data`;
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file,'');
  }
  const data = fs.readFileSync(file);
  await ctx.render('main.html', { data: data ? data : '', name: ctx.params.name });
});

router.post('/main/save', async(ctx) => {
    const { tasks, way, action } = <requestAnswer>ctx.request.body;
    const file = `${way}.data`;
    if (action === 'Restart') {
	const tasks = fs.readFileSync(file).toString().split("\n").map(v=>v.trim()).filter(v => v);
	console.log(`restart ${way} with tasks [${tasks.join(',')}]`);
	ctx.body = await deploy(way, tasks);
    } else {
	fs.writeFileSync(file,tasks);
	ctx.redirect(`/main/${way}`);
    }
});


app.use(router.routes());

app.listen(3000);

console.log('Server running on port 3000');