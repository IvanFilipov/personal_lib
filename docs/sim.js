'use-strict';

if (!THREE.WEBGL.isWebGLAvailable() ) {
	let warning = THREE.WEBGL.getWebGLErrorMessage();
	document.getElementById( 'container' ).appendChild( warning );
}

// parameters
const first_link_len = 100;
const base_hight = 20;
const second_link_len = 70;
const third_link_len = 40;

const max_vel = [0.05, 0.05, 0.05];
const max_accel = [0.01, 0.01, 0.01];

const joint_radius = 6;
const mainp_raduis = 8;

// types
const animation_t = {
	NONE: 1,
	SLOW: 2,
	FAST: 3
};

const velo_state = {
	STOPPED: 0,
	ACCEL:   1,
	CONST:   2,
	DEACCEL: 3
};

// control, GUI, render
let container, stats;
let camera, controls, scene, renderer;
let animation_type = animation_t.NONE;

// robot kinematics
let link_1, link_2, link_3;
let theta_1, theta_2, theta_3;
let desired_theta_1, desired_theta_2, desired_theta_3; 
let base_joint, joint_2, joint_3;

let cur_vel = [0.00, 0.00, 0.00];
let joints_cur_states = [velo_state.STOPPED, velo_state.STOPPED, velo_state.STOPPED];

let max_time_count;
let animation_time; 

let joints_times = [{t1: 0, t2: 0}, {t1: 0, t2: 0}, {t1: 0, t2: 0}];
let joints_dirs = [1, 1, 1];
let joints_distances = [0, 0, 0];
let joints_travelled = [0, 0, 0];

let joints = [];

let manip;
let target;

let target_coords;

let timer;
let delay;

let should_calc = false;
let should_move = false;

function init() {

	// setup camera
	camera = new THREE.PerspectiveCamera( 45, window.innerWidth / window.innerHeight, 0.1, 2000 );
	camera.position.set(0, 100, 500);

	// world
	scene = new THREE.Scene();
	load_mesh();

	// lights
	let light = new THREE.DirectionalLight(0xffffff);
	light.position.set(1, 1, 1);
	scene.add(light);
	light = new THREE.DirectionalLight(0x002288);
	light.position.set(-1, -1, -1);
	scene.add(light);
	light = new THREE.AmbientLight(0x222222);
	scene.add(light);

	// renderer
	renderer = new THREE.WebGLRenderer();
	renderer.setClearColor( 0x333333 );
	renderer.setSize( window.innerWidth, window.innerHeight );
	
	container = document.getElementById('container');
	container.appendChild(renderer.domElement);

	stats = new Stats();
	stats.domElement.style.position = 'absolute';
	stats.domElement.style.top = '0px';
	stats.domElement.style.zIndex = 100;
	container.appendChild(stats.domElement);

	window.addEventListener('resize', onWindowResize, false);
	
	controls = new THREE.OrbitControls(camera, renderer.domElement);
	controls.addEventListener('change', render);
	// some custom control settings
	controls.minDistance = 10;
	controls.maxDistance = 1000;
	controls.zoomSpeed = 2.0;

	scene.add(new THREE.AxesHelper(150));

	timer = Date.now();
	// GUI
	setupGui();
	
	should_calc = true;
	animate();
}

function load_mesh() {
	theta_1 = 0;
	theta_2 = Math.PI / 2;
	theta_3 = -Math.PI / 2;

	let material = new THREE.MeshLambertMaterial({color: 0x7BBCB5, shading: THREE.FlatShading });
	let material_2 = new THREE.MeshLambertMaterial({color: 0x7BBCB5, shading: THREE.FlatShading });
	let material_3 = new THREE.MeshLambertMaterial({color: 0x7BBCB5, shading: THREE.FlatShading });
	let materialManip = new THREE.MeshLambertMaterial({color: 0x0000aa, shading: THREE.FlatShading });
	let materialTarget = new THREE.MeshLambertMaterial({color: 0xaa0000, shading: THREE.FlatShading });

	// links and joints geometry (fixed size)
	let base_geo = new THREE.CylinderGeometry(5, 15, base_hight, 50);
	let first_link_geo = new THREE.CylinderGeometry(4, 4, first_link_len - base_hight, 50);
	let second_link_geo = new THREE.CylinderGeometry(4, 4, second_link_len, 50);
	let third_link_geo = new THREE.CylinderGeometry(4, 4, third_link_len, 50);
	let joint_geo = new THREE.SphereGeometry(joint_radius, 20, 20);
	let manip_geo = new THREE.SphereGeometry(mainp_raduis, 20, 20);
	// base
	base_joint = new THREE.Mesh(base_geo, material);
	base_joint.position.set(0, base_hight / 2, 0);
	scene.add(base_joint);
	// link_1
	link_1 = new THREE.Mesh(first_link_geo, material);
	link_1.position.set( 0, first_link_len / 2, 0 );
	base_joint.add(link_1);
	// joint 2
	joint_2 = new THREE.Mesh(joint_geo, material_2);
	joint_2.position.set( 0, (first_link_len - base_hight + joint_radius) / 2, 0 );
	link_1.add(joint_2);
	// link 2
	
	link_2 = new THREE.Mesh(second_link_geo, material_2);
	link_2.position.set( 0, second_link_len / 2, 0 );
	joint_2.add(link_2);
	
	joint_3 = new THREE.Mesh(joint_geo, material_3);
	joint_3.position.set( 0, (second_link_len + joint_radius) / 2, 0);
	link_2.add(joint_3)
	
	link_3 = new THREE.Mesh(third_link_geo, material_3);
	link_3.position.set(0, third_link_len / 2, 0);
	joint_3.add(link_3);
	// joint_3.add(new THREE.AxesHelper(10));

	manip = new THREE.Mesh(manip_geo, materialManip);
	manip.position.set(0, (third_link_len + mainp_raduis) / 2, 0);
	link_3.add(manip);
	
	//rotate_joint_2_on_angle(theta_2);
	//rotate_joint_2_on_angle();
	//rotate_base_joint_on_angle(Math.PI / 4);
	//rotate_joint_3_on_angle(theta_3);
	
	target = new THREE.Mesh (joint_geo, materialTarget);
	target.position.set(0, 100, 0);
	scene.add(target);

	scene.updateMatrixWorld(true);
	joints.push(base_joint);
	joints.push(joint_2);
	joints.push(joint_3);
}

function setupGui() {
	target_coords = { x: 60, y: 115, z: 80};

	var gui = new dat.GUI();
	
	let pag = gui.addFolder( "Target control" );
	pag.add(target_coords, "x", -200.0, 200.0, 0.1 ).name( "X" )
		.onChange( () => { if (!should_move) render(); });
	pag.add(target_coords, "y", -200.0, 200.0, 0.1 ).name( "Y" )
		.onChange( () => { if (!should_move) render(); });
	pag.add(target_coords, "z", -200.0, 200.0, 0.1 ).name( "Z" )
		.onChange( () => { if (!should_move) render(); });

	let animation_menu = gui.addFolder("Animation control");

	let obj = { go: function() {
		if (!should_move) {
			should_calc = true;
		}
	}, speed: animation_t.NONE};

	animation_menu.add(obj, 'speed', 
		{ None: animation_t.NONE, Slow: animation_t.SLOW, Fast: animation_t.FAST })
		.onChange((val) => { animation_type = val });

	animation_menu.add(obj,'go').name("GO!");

	pag.open();
	animation_menu.open();
}

function animate() {

	requestAnimationFrame(animate);
	controls.update();
	calc_angles();

	if (Date.now() - timer > delay && should_move) {
		animate_step();
		timer = Date.now();
	}
	render();
}

function calc_angles() {
	// in the math here y -> z; z->y (difference from the paper)
	if (!should_calc) 
		return;

	let {x, y, z} = target_coords;

	let [l1, l2, l3] = [first_link_len, second_link_len, third_link_len];
	

	desired_theta_1 = Math.atan2(z, x);
	console.log(desired_theta_1 * 180 / Math.PI);

	// calc theta_2
	let d2 = Math.sqrt(x * x + z * z);
	let d3 = y - l1;//Math.abs(y - l1);
	let d1 = Math.sqrt(d2 * d2 + d3 * d3);

	console.log("d1: ", d1, " d3: ", d3);

	let alpha = Math.asin(d3 / d1);
	//if (alpha < 0) alpha = Math.PI / 2 - alpha;

	if (d1 > l2 + l3) {
		desired_theta_3 = 0; // Math.PI;
		desired_theta_2 = -Math.PI / 2 + alpha;
	} else if (d1 > 0 && d1 < l2 - l3) {
		desired_theta_3 = Math.PI;
		desired_theta_2 = -Math.PI / 2 + alpha;
	} else {
		let fi_1 = Math.acos((l3 * l3 - l2 * l2 - d1 * d1) / (-2 * l2 * d1));
		let fi_2 = Math.acos((d1 * d1 - l2 * l2 - l3 * l3) / (-2 * l2 * l3));
		console.log("a: ", alpha* 180 / Math.PI, "fi_1: ", fi_1* 180 / Math.PI, "fi_2: ", fi_2* 180 / Math.PI);

		desired_theta_2 = -Math.PI / 2 + alpha + fi_1;
		desired_theta_3 = -Math.PI + fi_2;
	}

	console.log(desired_theta_2 * 180 / Math.PI);
	console.log(desired_theta_3 * 180 / Math.PI);

	should_calc = false;

	if (animation_type == animation_t.NONE) {
		go_to_end_point();
	} else {
		delay = (animation_type == animation_t.SLOW) ? 500 : 50;
		calc_times();
		should_move = true;
	}
}

function go_to_end_point() {
	theta_1 = desired_theta_1;
	theta_2 = desired_theta_2;
	theta_3 = desired_theta_3;
	joints_cur_states = [ velo_state.STOPPED, velo_state.STOPPED, velo_state.STOPPED ];
	change_joint_color(0);
	change_joint_color(1);
	change_joint_color(2);
	//manip.material.color.setHex(0x0000aa);
	rotate_base_joint_on_angle(theta_1);
	rotate_joint_3_on_angle(theta_3);
	rotate_joint_2_on_angle(theta_2);
}

function rotate_all_joints() {
	rotate_base_joint_on_angle(theta_1);
	rotate_joint_3_on_angle(theta_3);
	rotate_joint_2_on_angle(theta_2);
}

function calc_times() {

	animation_time = 0;
	max_time_count = 0;
	cur_vel = [0, 0, 0];
	joints_cur_states = [ velo_state.STOPPED, velo_state.STOPPED, velo_state.STOPPED ];
	joints_travelled = [0, 0, 0];

	calc_dist_dir();

	for (let i = 0; i < 3; i++) {
		let time_needed; 
		if (joints_distances[i] >= max_vel[i] * max_vel[i] / max_accel[i]) {
			time_needed = joints_distances[i] / max_vel[i] + max_vel[i] / max_accel[i];
		} else {
			time_needed = 2 * Math.sqrt(joints_distances[i] / max_accel[i]);
		}

		if (time_needed > max_time_count)
			max_time_count = time_needed;
	}

	max_time_count = Math.floor(max_time_count) - 1;

	for (let i = 0; i < 3; i++) {
		joints_times[i].t1 = (max_accel[i] * max_time_count - 
			Math.sqrt(max_accel[i] * max_time_count * max_accel[i] * max_time_count -
				4 * max_accel[i] * joints_distances[i])) / 2 * max_accel[i];
		joints_times[i].t1 = Math.ceil(joints_times[i].t1);

		joints_times[i].t1 = 1;
		joints_times[i].t2 = max_time_count - joints_times[i].t1;
	}

	console.log("dir: ", ((joints_dirs[0] == -1) ? "anit-clock" : "clock"),
				 "dist-angle: ", joints_distances[0] * 180 / Math.PI);
	console.log("dir 2: ", ((joints_dirs[1] == -1) ? "anit-clock" : "clock"),
				 "dist-angle 2: ", joints_distances[1] * 180 / Math.PI);
	console.log("dir 3: ", ((joints_dirs[2] == -1) ? "anit-clock" : "clock"),
	 			"dist-angle 3: ", joints_distances[2] * 180 / Math.PI);
}

function calc_dist_dir() {

	let angles = [theta_1, theta_2, theta_3];
	let desired_angles = [desired_theta_1, desired_theta_2, desired_theta_3];

	for (let i = 0; i < 3; i++)
	console.log("angles:", angles[i] * 180 / Math.PI, desired_angles[i] * 180 / Math.PI);

	let theta_full   = (angles[0] > 0) ? angles[0] : 2 * Math.PI + angles[0];
	let desired_full = (desired_angles[0] > 0) ? desired_angles[0] : 2 * Math.PI + desired_angles[0];

	if ((theta_full + Math.PI) % (Math.PI * 2) > desired_full) {
		joints_dirs[0] = 1;
		if (theta_full > desired_full) {
			joints_distances[0] = (Math.PI * 2) - theta_full + desired_full;
		} else {
			joints_distances[0] = desired_full - theta_full;
		}	
	} else {
		joints_dirs[0] = -1;
		if (theta_full > desired_full) {
			joints_distances[0] = theta_full - desired_full;
		} else {
			joints_distances[0] = (Math.PI * 2) - desired_full + theta_full;
		}
	}

	theta_full   = angles[1] + Math.PI / 2;
	desired_full = desired_angles[1] + Math.PI / 2;

	if (theta_full > desired_full) {
		joints_dirs[1] = -1;
		joints_distances[1] = theta_full - desired_full;
	} else {
		joints_dirs[1] = 1;
		joints_distances[1] = desired_full - theta_full;
	}

	theta_full   = angles[2] + Math.PI / 2;
	desired_full = desired_angles[2] + Math.PI / 2;

	if (theta_full > desired_full) {
		joints_dirs[2] = -1;
		joints_distances[2] = theta_full - desired_full;
	} else {
		joints_dirs[2] = 1;
		joints_distances[2] = desired_full - theta_full;
	}
}

function animate_step() {
	
	console.log("animation step");
	if (animation_time >= max_time_count) {
		// fake angles maybe
		go_to_end_point();
		should_move = false;
		return;
	}

	for (let i = 0; i < 3; i++) {
		if (joints_distances[i] > 0) {

			if (joints_travelled[i] > joints_distances[i]) {
				joints_cur_states[i] = velo_state.STOPPED;
				change_joint_color(i);
				continue;
			} else if (joints_travelled[i] < 0.10 * joints_distances[i]) {
				joints_cur_states[i] = velo_state.ACCEL;
				cur_vel[i] = Math.min(cur_vel[i] + max_accel[i], max_vel[i]);
			} else if (joints_distances[i] - joints_travelled[i] < 0.10 * joints_distances[i]) {
				joints_cur_states[i] = velo_state.DEACCEL;
				cur_vel[i] = Math.max(cur_vel[i] - max_accel[i], 0.01);
			} else {
				joints_cur_states[i] = velo_state.CONST;
				cur_vel[i] = max_vel[i];
			}

			change_joint_color(i);

			joints_travelled[i] += cur_vel[i];
			switch (i) {
			case 0: theta_1 += joints_dirs[i] * cur_vel[i];
					console.log("theta_1:", theta_1 * 180 / Math.PI, "velo:" , cur_vel[i]);
					break;
			case 1: theta_2 += joints_dirs[i] * cur_vel[i];
					console.log("theta_2:", theta_2 * 180 / Math.PI, "velo:" , cur_vel[i]);
					break;
			case 2: theta_3 += joints_dirs[i] * cur_vel[i];
					console.log("theta_3:", theta_3 * 180 / Math.PI, "velo:" , cur_vel[i]);
					break;
			default: break;
			} 
		} 
	}

	rotate_all_joints();
	animation_time += 1;	
}

function change_joint_color(joint_index) {
	let clr = 0x7BBCB5;
	switch (joints_cur_states[joint_index]) {
	case velo_state.STOPPED: clr = 0x7BBCB5; break;
	case velo_state.ACCEL:   clr = 0x77aa00; break;
	case velo_state.CONST:   clr = 0xDEE829; break;
	case velo_state.DEACCEL: clr = 0xF10E0E; break;
	default:                 clr = 0x7BBCB5;
	}
	joints[joint_index].material.color.setHex(clr);
}

function onWindowResize() {
	camera.aspect = window.innerWidth / window.innerHeight;
	camera.updateProjectionMatrix();
	console.log(camera.position);
	renderer.setSize( window.innerWidth, window.innerHeight );
	render();
}

function render() {
	target.position.set(target_coords.x, target_coords.y, target_coords.z);
	renderer.render(scene, camera);
	stats.update();
}

function rotate_joint_2_on_angle(angle) {
	joint_2.rotation.z = angle;
}

function rotate_joint_3_on_angle(angle) {
	joint_3.rotation.z = angle;
}

function rotate_base_joint_on_angle(angle) {
	base_joint.rotation.y = -angle;
}

init();
render();