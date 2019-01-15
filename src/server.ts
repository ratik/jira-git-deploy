import * as Koa from 'koa';
import * as Router from 'koa-router';
import * as bodyParser from 'koa-bodyparser';
import * as _ from 'lodash';
const JiraAPI = require('jira-client');
import { Docker } from 'node-docker-api';
const aha = require('aha');

const docker = new Docker({ socketPath: '/var/run/docker.sock' });

const jira = new JiraAPI({
    protocol: process.env.JIRA_PROTOCOL!,
    host: process.env.JIRA_HOST!,
    port: process.env.JIRA_PORT!,
    username: process.env.JIRA_USERNAME!,
    password: process.env.JIRA_PASSWORD!,
    apiVersion: process.env.JIRA_API_VERSION!
});

const getTasks = async (stateId: string)  => {
    const project = await jira.listSprints(process.env.JIRA_PROJECT_ID);
    const sprints = project.sprints.filter((v: any) => v.state === 'ACTIVE');
    if (sprints.length) {
	console.log(`${sprints.length} active sprints`);
	let data: string[] = [];
	for(const sprint of sprints) {
	    console.log(`Doing sprint ${sprint.id}`);
	    const tasks = await jira.getSprintIssues(process.env.JIRA_PROJECT_ID, sprint.id);
	    console.log(tasks.contents.completedIssues);
	    for(const task of tasks.contents.issuesNotCompletedInCurrentSprint.concat(tasks.contents.completedIssues)) {
		if (task.status.id === stateId) {
		    console.log(`adding task ${task.key}`)
		    data.push(task.key);
		}
	    }
	}
        return { ok: true, tasks: data.reverse() }
    } else {
	return { ok: false, tasks:[], error: 'no active sprints' };
    }
};
interface ContainerData {
	State: string,
	Names: string[]
};

interface ContainerBranches {
	name: string,
	branches: string[],
	container: Object
};

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

app.use(bodyParser({
  onerror: function (err, ctx) {
    ctx.throw('body parse error', 422);
  }
}));

app.use(async (ctx, next) => {
    await next();
});

const router = new Router();

router.get('/release/:name', async (ctx) => {
    const stateId: string = process.env.JIRA_STATE_ID || '';
    const tasks = await getTasks(stateId);
    const containers = await getContainers();
    let temp = '';
    for(const one of containers) {
	if (one.container.data.Names[0] !== `/webtycoon-${ctx.params.name}`) {
	    continue;
	}
	let restart = true;
	temp += await execCommandInContainer(one.container, "git reset --merge");
	temp += await execCommandInContainer(one.container, "git checkout master");
	temp += await execCommandInContainer(one.container, "git pull origin");
	temp += await execCommandInContainer(one.container, "git branch -D tempRC");
	temp += await execCommandInContainer(one.container, "git checkout -b tempRC");
	if (tasks.tasks.length) {
	    for(const task of tasks.tasks) {
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
	    temp += await execCommandInContainer(one.container, "sh restart.sh", true);
	} else {
	    temp += await execCommandInContainer(one.container, "git diff --name-status --diff-filter=U");
	    temp += await execCommandInContainer(one.container, "git --no-pager diff --diff-filter=U");
	}
    }
    ctx.body = `<pre>${temp}</pre>`;
});

/*router.post('/*', async (ctx) => {
    ctx.body = 'ok';
    console.log(ctx.request);
    console.log(ctx.request.body);
});
/**/
router.post('/jira', async (ctx) => {
    ctx.body = 'ok';
    console.log(ctx.request.body);
});


app.use(router.routes());

app.listen(3000);

console.log('Server running on port 3000');