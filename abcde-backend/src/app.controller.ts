import { AuthService } from '#auth/auth.service';
import { JwtAuthGuard } from '#auth/jwt-auth.guard';
import { LocalAuthGuard } from '#auth/local-auth.guard';
import { CodeInfoService } from '#codeInfo/codeInfo.service';
import { ProjectsService } from '#projects/projects.service';
import { Controller, Param, Post, Request, UseGuards } from '@nestjs/common';

@Controller()
export class AppController {
  constructor(
    private authService: AuthService,
    private projectsService: ProjectsService,
    private codeInfoService: CodeInfoService,
  ) {}

  @UseGuards(LocalAuthGuard)
  @Post('auth/login')
  async login(@Request() req) {
    return this.authService.login(req.user);
  }

  @Post('auth/register')
  async register(@Request() req) {
    return this.authService.register(req.body);
  }

  @UseGuards(JwtAuthGuard)
  @Post('')
  verifyToken(@Request() req) {
    return req.user;
  }

  @UseGuards(JwtAuthGuard)
  @Post('projects')
  getProjects(@Request() req) {
    return this.projectsService.getAllByOwner(req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Post('projects/load/:id')
  loadProject(@Param('id') id: string) {
    return this.projectsService.loadOne(id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('projects/save')
  saveProject(@Request() req) {
    return this.projectsService.save(req.body.project);
  }

  @UseGuards(JwtAuthGuard)
  @Post('projects/createProject')
  createProject(@Request() req) {
    return this.projectsService.createProject(req.user, req.body.name);
  }

  @Post('codeInfo/getCollectionsAndModules')
  getCollectionsAndModules(@Request() req) {
    return this.codeInfoService.getCollectionsAndModules(req.body.searchTerm);
  }

  @Post('codeInfo/getCollectionDetails')
  getCollectionDetails(@Request() req) {
    return this.codeInfoService.getCollectionDetails(req.body.codeInfoId);
  }
}
