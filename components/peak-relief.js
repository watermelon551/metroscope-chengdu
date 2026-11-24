import * as T from 'three';

// The lit surface follows actual ride edges. Only station endpoints carry observations.
window.PeakRelief = class PeakRelief {
  constructor(stage, layout, rows, heightUnit, rateColor) {
    this.rateColor = rateColor;
    this.layout = layout;
    this.heightUnit = heightUnit;
    this.renderer = new T.WebGLRenderer({alpha:true,antialias:true});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));
    this.renderer.setClearColor(0,0);
    this.renderer.domElement.className = 'peak-gl';
    this.scene = new T.Scene();
    this.camera = new T.OrthographicCamera(-1,1,1,-1,1,7000);
    this.scene.add(new T.HemisphereLight(0xd7f6ff,0x193150,1.7));
    const sun = new T.DirectionalLight(0xffdbc3,2.2);
    sun.position.set(-700,950,480);
    this.scene.add(sun);
    this.panel = new T.Mesh(new T.BoxGeometry(1520,26,1480),new T.MeshStandardMaterial({color:0x154052,roughness:.55,metalness:.3}));
    this.panel.position.set(-78,-18,25);
    this.scene.add(this.panel);
    const border = new T.LineSegments(new T.EdgesGeometry(this.panel.geometry),new T.LineBasicMaterial({color:0x457281}));
    this.panel.add(border);
    this.paper = document.createElement('canvas');
    this.paper.width = 2048; this.paper.height = 2048;
    const texture = new T.CanvasTexture(this.paper);
    texture.colorSpace = T.SRGBColorSpace;
    texture.anisotropy = Math.min(8,this.renderer.capabilities.getMaxAnisotropy());
    this.floor = new T.Mesh(new T.PlaneGeometry(1520,1480),new T.MeshBasicMaterial({map:texture}));
    this.floor.rotation.x = -Math.PI/2;
    this.floor.position.set(-78,-4,25);
    this.scene.add(this.floor);
    const count = rows.length;
    this.pins = new T.InstancedMesh(new T.CylinderGeometry(4.5,6,1,8),new T.MeshStandardMaterial({roughness:.35,metalness:.2}),count);
    this.caps = new T.InstancedMesh(new T.SphereGeometry(4.8,10,6),new T.MeshBasicMaterial(),count);
    this.scene.add(this.pins,this.caps);
    this.ridges = new T.Mesh(new T.BufferGeometry(),new T.ShaderMaterial({
      transparent:true,depthWrite:false,side:T.DoubleSide,vertexColors:true,
      uniforms:{unit:{value:heightUnit}},
      vertexShader:`varying vec3 tint; varying float altitude; void main(){tint=color; altitude=position.y; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader:`varying vec3 tint; varying float altitude; uniform float unit;
        void main(){float q=altitude/unit*10.;float line=1.-smoothstep(.005,max(.012,fwidth(q)*1.3),abs(q-round(q)));
        float h=clamp(altitude/unit,0.,1.);gl_FragColor=vec4(mix(tint*.49,tint, line*.8+h*.2),.25+h*.30+line*.18);
        #include <colorspace_fragment>
        }`
    }));
    this.crest = new T.LineSegments(new T.BufferGeometry(),new T.LineBasicMaterial({vertexColors:true}));
    this.scene.add(this.ridges,this.crest);
    this.edges = this.sampleEdges(layout);
    this.ray = new T.Raycaster();
    stage.prepend(this.renderer.domElement);
  }

  sampleEdges(layout) {
    const paths = new Map(layout.paths.map(p => {
      const node = document.createElementNS('http://www.w3.org/2000/svg','path');
      node.setAttribute('d',p.d);
      const length = node.getTotalLength(), n = Math.max(1,Math.ceil(length/12));
      return [p.id,Array.from({length:n+1},(_,i) => node.getPointAtLength(i*length/n))];
    }));
    const stations = new Map(layout.stations.map(s=>[s.name,s]));
    const edges = [];
    for (const [key,ids] of Object.entries(layout.ridePaths)) {
      const [line,a,b] = key.split('|');
      if (a>=b) continue;
      let last = stations.get(a), length = 0;
      const points = [{x:last.x,y:last.y,d:0}];
      // An edge can contain several undirected drawing pieces. Orient from the origin.
      const pieces = ids.map(id=>paths.get(id));
      while (pieces.length) {
        let best=Infinity, index=0, reverse=false;
        pieces.forEach((piece,i) => {
          for (const rev of [false,true]) {
            const end = rev ? piece.at(-1) : piece[0], dist=Math.hypot(end.x-last.x,end.y-last.y);
            if(dist<best){best=dist;index=i;reverse=rev;}
          }
        });
        const piece = pieces.splice(index,1)[0];
        for (const p of reverse ? [...piece].reverse() : piece) {
          length+=Math.hypot(p.x-last.x,p.y-last.y);points.push({x:p.x,y:p.y,d:length});last=p;
        }
      }
      const end=stations.get(b);
      length+=Math.hypot(end.x-last.x,end.y-last.y);
      points.push({x:end.x,y:end.y,d:length});
      edges.push({a,b,line:+line,points,length});
    }
    return edges;
  }

  color(rate) {
    return new T.Color(this.rateColor(rate));
  }

  update(rows,blocked,line) {
    this.rows = rows;
    const byName = new Map(rows.map(s => [s.name,s]));
    const obj = new T.Object3D();
    rows.forEach((s,i) => {
      const height=Math.max(.7,s.rate*this.heightUnit), {x,y}=s.station;
      const color=this.color(s.rate);
      if(line && !s.station.lines.includes(line)) color.multiplyScalar(.16);
      obj.position.set(x,height/2,y);obj.scale.set(1,height,1);obj.updateMatrix();
      this.pins.setMatrixAt(i,obj.matrix); this.pins.setColorAt(i,color);
      obj.position.y=height;obj.scale.setScalar(s.count ? 1 : .55);obj.updateMatrix();
      this.caps.setMatrixAt(i,obj.matrix);this.caps.setColorAt(i,color);
    });
    for (const mesh of [this.pins,this.caps]) {
      mesh.instanceMatrix.needsUpdate=true;mesh.instanceColor.needsUpdate=true;mesh.computeBoundingSphere();
    }
    const faces=[], faceColors=[], tops=[], topColors=[];
    for (const edge of this.edges) {
      const a=byName.get(edge.a), b=byName.get(edge.b);
      if(!a || !b || Math.max(a.rate,b.rate)<.018 || (line && edge.line!==line)) continue;
      const vertices=edge.points.map(p=>{
        const rate=a.rate+(b.rate-a.rate)*p.d/(edge.length || 1);
        return {base:[p.x,.3,p.y],top:[p.x,rate*this.heightUnit,p.y],color:this.color(rate).toArray()};
      });
      for(let i=1;i<vertices.length;i++){
        const u=vertices[i-1], v=vertices[i];
        faces.push(...u.base,...v.base,...v.top,...u.base,...v.top,...u.top);
        faceColors.push(...u.color,...v.color,...v.color,...u.color,...v.color,...u.color);
        tops.push(...u.top,...v.top);topColors.push(...u.color,...v.color);
      }
    }
    for(const [mesh,positions,colors] of [[this.ridges,faces,faceColors],[this.crest,tops,topColors]]){
      mesh.geometry.dispose();
      mesh.geometry = new T.BufferGeometry();
      mesh.geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));
      mesh.geometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));
    }
    this.paintFloor(rows,blocked,line);
  }

  paintFloor(rows,blocked,line) {
    const c=this.paper.getContext('2d');
    c.setTransform(2048/1520,0,0,2048/1480,838*2048/1520,715*2048/1480);
    const base=c.createRadialGradient(-90,40,30,-90,40,920);
    base.addColorStop(0,'#203c4a');base.addColorStop(.65,'#102c3b');base.addColorStop(1,'#0a202f');
    c.fillStyle=base;c.fillRect(-838,-715,1520,1480);
    c.fillStyle='#375365';
    for(let x=-830;x<685;x+=20)for(let y=-710;y<765;y+=20)c.fillRect(x,y,1.2,1.2);
    // A bounded halo per station, combined by max so dense stops cannot inflate the rate.
    const cell=8, nx=190, ny=185, field=new Float32Array(nx*ny);
    for(const s of rows){
      if(s.rate<.012 || (line && !s.station.lines.includes(line))) continue;
      const gx=(s.station.x+838)/cell-.5, gy=(s.station.y+715)/cell-.5, radius=12;
      for(let j=Math.max(0,Math.floor(gy-radius));j<=Math.min(ny-1,gy+radius);j++){
        for(let i=Math.max(0,Math.floor(gx-radius));i<=Math.min(nx-1,gx+radius);i++){
          const weight=Math.max(0,1-((i-gx)**2+(j-gy)**2)/radius**2);
          field[j*nx+i]=Math.max(field[j*nx+i],s.rate*weight**2);
        }
      }
    }
    c.save();c.translate(-838,-715);c.scale(cell,cell);
    const contourPath=d3.geoPath(null,c);
    const levels=[.02,.07,.15,.25,.4,.55,.7,.85];

    d3.contours().size([nx,ny]).thresholds(levels)(field).forEach(shape=>{
      c.beginPath();contourPath(shape);c.globalAlpha=.24+.46*shape.value;c.fillStyle=this.rateColor(shape.value);c.fill();
      c.strokeStyle='#b9d7d0';c.globalAlpha=.28;c.lineWidth=.14;c.stroke();
    });
    c.restore();
    c.globalCompositeOperation='source-over';c.lineCap='round';c.lineJoin='round';
    for(const p of this.layout.paths){
      c.globalAlpha=line ? (p.line===line ? .95 : .12) : .48;
      c.strokeStyle=line && p.line===line ? p.color : '#a3c4c8';c.lineWidth=2.6;c.stroke(new Path2D(p.d));
    }
    c.globalAlpha=1;
    const ban=this.layout.stations.find(s=>s.name===blocked);
    c.strokeStyle='#ff9478'; c.lineWidth=3;
    for(const r of [22,31]){c.beginPath();c.arc(ban.x,ban.y,r,0,Math.PI*2);c.stroke();}
    c.beginPath();c.moveTo(ban.x-7,ban.y-7);c.lineTo(ban.x+7,ban.y+7);
    c.moveTo(ban.x+7,ban.y-7);c.lineTo(ban.x-7,ban.y+7);c.stroke();
    this.floor.material.map.needsUpdate=true;
  }

  render(state,w,h,k) {
    const r=this.renderer, camera=this.camera;
    if(this.w!==w || this.h!==h){r.setSize(w,h,false);this.w=w;this.h=h;}
    camera.left=-w/(2*k);camera.right=-camera.left;
    camera.top=h*.53/k;camera.bottom=-h*.47/k;
    const target=new T.Vector3(state.x,state.focusHeight || 0,state.y);
    const lift=Math.cos(state.pitch);
    camera.position.set(Math.sin(state.yaw)*lift,Math.sin(state.pitch),Math.cos(state.yaw)*lift)
      .multiplyScalar(3400).add(target);
    camera.lookAt(target);camera.updateProjectionMatrix();
    r.render(this.scene,camera);
  }

  pick(event,rect) {
    this.ray.setFromCamera(new T.Vector2(2*(event.clientX-rect.left)/rect.width-1,1-2*(event.clientY-rect.top)/rect.height),this.camera);
    const hit=this.ray.intersectObjects([this.pins,this.caps])[0];
    return hit && this.rows[hit.instanceId].name;
  }
};
